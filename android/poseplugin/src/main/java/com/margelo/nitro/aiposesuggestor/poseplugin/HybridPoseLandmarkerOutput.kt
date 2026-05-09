// Output-attached MediaPipe pose-landmark detector. Mirrors the
// react-native-vision-camera-barcode-scanner HybridBarcodeScannerOutput pattern:
// the Output owns its own androidx.camera.core.ImageAnalysis UseCase, runs
// inference on the analyzer thread, and emits results back to the main JS
// runtime via a regular (non-worklet) Nitro callback.
//
// Per ADR-001 G14 (2026-05-03), this replaces the worklet-callable factory
// hybrid that hit unfixable Variant return-value marshalling crashes.

package com.margelo.nitro.aiposesuggestor.poseplugin

import android.graphics.Bitmap
import android.graphics.Matrix
import android.util.Log
import androidx.camera.core.ImageAnalysis
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.margelo.nitro.camera.CameraOrientation
import com.margelo.nitro.camera.MediaType
import com.margelo.nitro.camera.MirrorMode
import com.margelo.nitro.camera.extensions.surfaceRotation
import com.margelo.nitro.camera.public.NativeCameraOutput
import java.util.concurrent.Executors

class HybridPoseLandmarkerOutput :
    HybridPoseLandmarkerOutputSpec(),
    NativeCameraOutput {

    // Single-thread executor for the analyzer. CameraX guarantees analyze() is
    // called serially on this thread; we depend on that for timestamp
    // monotonicity that MediaPipe's RunningMode.VIDEO requires.
    private val executor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "PosePlugin.analyzer")
    }

    override val mediaType: MediaType = MediaType.VIDEO
    // G33: pin outputOrientation to UP and ignore framework writes. Vision
    // Camera otherwise updates this from the device-orientation sensor every
    // frame, which flips imageAnalysis.targetRotation between 0/90/180/270
    // and makes imageInfo.rotationDegrees bounce per-frame. We pin it so the
    // sensor→display rotation we apply to the bitmap is stable.
    override var outputOrientation: CameraOrientation
        get() = CameraOrientation.UP
        set(_) {
            // intentionally ignored
        }
    override var mirrorMode: MirrorMode = MirrorMode.AUTO

    private var imageAnalysis: ImageAnalysis? = null
        set(value) {
            field = value
            updateAnalyzer()
        }

    @Volatile
    private var onResults: ((PoseLandmarkResult) -> Unit)? = null

    // Tracks the last frame timestamp we passed to MediaPipe (in ms).
    // detectForVideo requires strictly monotonic timestamps; CameraX usually
    // gives us monotonic frame timestamps, but we defend against the rare
    // duplicate by skipping it.
    private var lastFrameTimestampMs: Long = -1L

    // Lightweight perf sampling for ADR-001 G14. Every PERF_LOG_EVERY frames
    // we emit one Log.i with average inference time + analyzer FPS so the
    // perf audit can be driven from logcat without a UI overlay.
    private var perfFrameCount: Int = 0
    private var perfInferenceMsSum: Double = 0.0
    private var perfWindowStartNs: Long = System.nanoTime()

    override fun setOnResultsCallback(onResults: ((PoseLandmarkResult) -> Unit)?) {
        this.onResults = onResults
    }

    override fun createUseCase(
        mirrorMode: MirrorMode,
        config: NativeCameraOutput.Config,
    ): NativeCameraOutput.PreparedUseCase {
        val imageAnalysis = ImageAnalysis.Builder()
            .apply {
                // RGBA_8888 is required by MediaPipe's MediaImageBuilder. G14
                // fix #1: let CameraX do the YUV→RGBA conversion inline
                // instead of doing it ourselves with RenderScript. Supported
                // since CameraX 1.3 — our androidx.camera:camera-core:1.7.0
                // -alpha01 has it.
                setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)

                // Drop frames if the analyzer is still busy. MediaPipe
                // inference is the slow path; queueing would balloon RAM and
                // lag the preview.
                setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)

                setBackgroundExecutor(executor)
                setTargetRotation(outputOrientation.surfaceRotation)
            }
            .build()

        return NativeCameraOutput.PreparedUseCase(imageAnalysis) {
            this.imageAnalysis = imageAnalysis
            this.mirrorMode = mirrorMode
        }
    }

    private fun updateAnalyzer() {
        val imageAnalysis = imageAnalysis ?: return

        imageAnalysis.setAnalyzer(executor) { image ->
            try {
                val callback = onResults
                if (callback == null) {
                    return@setAnalyzer
                }

                val mp = try {
                    PoseLandmarkerCore.ensureInitialized()
                } catch (e: Throwable) {
                    Log.e(TAG, "analyze: MediaPipe init failed; will retry next frame", e)
                    return@setAnalyzer
                }

                // CameraX gives the timestamp in ns; MediaPipe wants ms.
                val frameTsMs = image.imageInfo.timestamp / 1_000_000L
                if (frameTsMs <= lastFrameTimestampMs) {
                    // Skip duplicate / out-of-order frame.
                    return@setAnalyzer
                }
                lastFrameTimestampMs = frameTsMs

                // G33: rotate the bitmap manually before handing it to
                // MediaPipe. The earlier ImageProcessingOptions.setRotationDegrees
                // path was accepted by MediaPipe Tasks 0.10.21 but didn't
                // actually rotate the input image — landmarks came back
                // collapsed against the sensor-orientation axis. Rotating the
                // bitmap up-front and passing the upright frame with no
                // rotation hint is the documented fallback and produces a
                // correctly-oriented detection.
                //
                // We use ImageProxy.toBitmap() (CameraX 1.3+; we ship 1.7
                // -alpha01) which handles the RGBA_8888 → Bitmap decode that
                // matches our setOutputImageFormat above.
                val sourceBitmap: Bitmap = image.toBitmap()
                val rotationDegrees = image.imageInfo.rotationDegrees
                val uprightBitmap: Bitmap = if (rotationDegrees != 0) {
                    val matrix = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
                    val rotated = Bitmap.createBitmap(
                        sourceBitmap, 0, 0,
                        sourceBitmap.width, sourceBitmap.height,
                        matrix, true,
                    )
                    sourceBitmap.recycle()
                    rotated
                } else {
                    sourceBitmap
                }

                val mpImage = BitmapImageBuilder(uprightBitmap).build()

                val t0 = System.nanoTime()
                val result = mp.detectForVideo(mpImage, frameTsMs)
                val inferenceMs = (System.nanoTime() - t0) / 1_000_000.0

                val poses = result.landmarks()
                if (poses.isEmpty() || poses[0].isEmpty()) {
                    // No person in frame — drop silently. JS-side staleness
                    // detection in usePoseStream handles the "no person" UX.
                    return@setAnalyzer
                }

                val firstPose = poses[0]
                val landmarks = Array(firstPose.size) { i ->
                    val lm = firstPose[i]
                    PoseLandmark(
                        x = lm.x().toDouble(),
                        y = lm.y().toDouble(),
                        z = lm.z().toDouble(),
                        visibility = lm.visibility().orElse(0f).toDouble(),
                        presence = lm.presence().orElse(0f).toDouble(),
                    )
                }

                callback(PoseLandmarkResult(landmarks, inferenceMs))

                perfFrameCount++
                perfInferenceMsSum += inferenceMs
                if (perfFrameCount >= PERF_LOG_EVERY) {
                    val nowNs = System.nanoTime()
                    val windowSec = (nowNs - perfWindowStartNs) / 1e9
                    val analyzerFps = perfFrameCount / windowSec
                    val avgMs = perfInferenceMsSum / perfFrameCount
                    val lShld = landmarks[11]
                    val rShld = landmarks[12]
                    val lHip = landmarks[23]
                    val rHip = landmarks[24]
                    Log.i(
                        TAG,
                        ("perf: fps=%.1f infer=%.1fms %s rot=%d " +
                            "lShld=(%.2f,%.2f|v%.2f) rShld=(%.2f,%.2f|v%.2f) " +
                            "lHip=(%.2f,%.2f|v%.2f) rHip=(%.2f,%.2f|v%.2f)").format(
                            analyzerFps,
                            avgMs,
                            if (PoseLandmarkerCore.usingGpu) "GPU" else "CPU",
                            rotationDegrees,
                            lShld.x, lShld.y, lShld.visibility,
                            rShld.x, rShld.y, rShld.visibility,
                            lHip.x, lHip.y, lHip.visibility,
                            rHip.x, rHip.y, rHip.visibility,
                        ),
                    )
                    perfFrameCount = 0
                    perfInferenceMsSum = 0.0
                    perfWindowStartNs = nowNs
                }
            } catch (e: Throwable) {
                Log.e(TAG, "analyze: unhandled exception", e)
            } finally {
                image.close()
            }
        }
    }

    companion object {
        private const val TAG = "PosePluginOutput"
        private const val PERF_LOG_EVERY = 30
    }
}
