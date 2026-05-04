// Output-attached MediaPipe face-landmark detector. Mirrors
// HybridPoseLandmarkerOutput exactly (ADR-001 G14/G15): the Output owns its
// own androidx.camera.core.ImageAnalysis UseCase, runs inference on the
// analyzer thread, and emits results back to the main JS runtime via a
// regular (non-worklet) Nitro callback.
//
// Used only during onboarding's face-capture step — never on the main
// camera preview during normal use.

package com.margelo.nitro.aiposesuggestor.poseplugin

import android.util.Log
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import com.google.mediapipe.framework.image.MediaImageBuilder
import com.margelo.nitro.camera.CameraOrientation
import com.margelo.nitro.camera.MediaType
import com.margelo.nitro.camera.MirrorMode
import com.margelo.nitro.camera.extensions.surfaceRotation
import com.margelo.nitro.camera.public.NativeCameraOutput
import java.util.concurrent.Executors

class HybridFaceLandmarkerOutput :
    HybridFaceLandmarkerOutputSpec(),
    NativeCameraOutput {

    // Single-thread executor for the analyzer. CameraX guarantees analyze() is
    // called serially on this thread; we depend on that for timestamp
    // monotonicity that MediaPipe's RunningMode.VIDEO requires.
    private val executor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "FacePlugin.analyzer")
    }

    override val mediaType: MediaType = MediaType.VIDEO
    override var outputOrientation: CameraOrientation = CameraOrientation.UP
        set(value) {
            field = value
            imageAnalysis?.targetRotation = value.surfaceRotation
        }
    override var mirrorMode: MirrorMode = MirrorMode.AUTO

    private var imageAnalysis: ImageAnalysis? = null
        set(value) {
            field = value
            updateAnalyzer()
        }

    @Volatile
    private var onResults: ((FaceLandmarkResult) -> Unit)? = null

    // detectForVideo requires strictly monotonic timestamps; CameraX usually
    // gives us monotonic frame timestamps, but we defend against the rare
    // duplicate by skipping it.
    private var lastFrameTimestampMs: Long = -1L

    // Lightweight perf sampling (mirrors pose). Every PERF_LOG_EVERY frames
    // we emit one Log.i with average inference time + analyzer FPS.
    private var perfFrameCount: Int = 0
    private var perfInferenceMsSum: Double = 0.0
    private var perfWindowStartNs: Long = System.nanoTime()

    override fun setOnResultsCallback(onResults: ((FaceLandmarkResult) -> Unit)?) {
        this.onResults = onResults
    }

    override fun createUseCase(
        mirrorMode: MirrorMode,
        config: NativeCameraOutput.Config,
    ): NativeCameraOutput.PreparedUseCase {
        val imageAnalysis = ImageAnalysis.Builder()
            .apply {
                setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
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

    @androidx.annotation.OptIn(ExperimentalGetImage::class)
    private fun updateAnalyzer() {
        val imageAnalysis = imageAnalysis ?: return

        imageAnalysis.setAnalyzer(executor) { image ->
            try {
                val callback = onResults
                if (callback == null) {
                    return@setAnalyzer
                }

                val mediaImage = image.image
                if (mediaImage == null) {
                    Log.w(TAG, "analyze: image.image was null, skipping frame")
                    return@setAnalyzer
                }

                val mp = try {
                    FaceLandmarkerCore.ensureInitialized()
                } catch (e: Throwable) {
                    Log.e(TAG, "analyze: MediaPipe init failed; will retry next frame", e)
                    return@setAnalyzer
                }

                // CameraX gives the timestamp in ns; MediaPipe wants ms.
                val frameTsMs = image.imageInfo.timestamp / 1_000_000L
                if (frameTsMs <= lastFrameTimestampMs) {
                    return@setAnalyzer
                }
                lastFrameTimestampMs = frameTsMs

                val mpImage = MediaImageBuilder(mediaImage).build()

                val t0 = System.nanoTime()
                val result = mp.detectForVideo(mpImage, frameTsMs)
                val inferenceMs = (System.nanoTime() - t0) / 1_000_000.0

                val faces = result.faceLandmarks()
                if (faces.isEmpty() || faces[0].isEmpty()) {
                    return@setAnalyzer
                }

                // MediaPipe Face Landmarker emits 478 points (468 face mesh +
                // 10 iris). The JS-side deriveFaceShape contract expects
                // exactly 468 — slice to drop iris if present.
                val firstFace = faces[0]
                val sliced = if (firstFace.size > FACE_MESH_SIZE) {
                    firstFace.subList(0, FACE_MESH_SIZE)
                } else {
                    firstFace
                }

                val landmarks = Array(sliced.size) { i ->
                    val lm = sliced[i]
                    FaceLandmark(
                        x = lm.x().toDouble(),
                        y = lm.y().toDouble(),
                        z = lm.z().toDouble(),
                    )
                }

                callback(FaceLandmarkResult(landmarks, inferenceMs))

                perfFrameCount++
                perfInferenceMsSum += inferenceMs
                if (perfFrameCount >= PERF_LOG_EVERY) {
                    val nowNs = System.nanoTime()
                    val windowSec = (nowNs - perfWindowStartNs) / 1e9
                    val analyzerFps = perfFrameCount / windowSec
                    val avgMs = perfInferenceMsSum / perfFrameCount
                    Log.i(
                        TAG,
                        "perf: analyzerFps=%.1f avgInferMs=%.1f delegate=%s frames=%d window=%.2fs".format(
                            analyzerFps,
                            avgMs,
                            if (FaceLandmarkerCore.usingGpu) "GPU" else "CPU",
                            perfFrameCount,
                            windowSec,
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
        private const val TAG = "FacePluginOutput"
        private const val PERF_LOG_EVERY = 30
        private const val FACE_MESH_SIZE = 468
    }
}
