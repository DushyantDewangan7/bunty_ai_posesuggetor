package com.margelo.nitro.aiposesuggestor.poseplugin

import android.util.Log
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker as MpFaceLandmarker
import com.margelo.nitro.NitroModules

// Singleton owner of the MediaPipe `FaceLandmarker`. Mirrors PoseLandmarkerCore
// (ADR-001 G14/G15): RunningMode.VIDEO requires monotonically increasing
// timestamps per landmarker, so a singleton keeps that contract even if
// future code paths share the instance.
internal object FaceLandmarkerCore {

    private const val TAG = "FacePluginCore"

    @Volatile
    private var instance: MpFaceLandmarker? = null
    @Volatile
    var usingGpu: Boolean = false
        private set

    @Synchronized
    fun ensureInitialized(): MpFaceLandmarker {
        instance?.let { return it }

        try {
            val mp = create(useGpu = true)
            instance = mp
            usingGpu = true
            Log.i(TAG, "init: GPU OK")
            return mp
        } catch (gpuErr: Throwable) {
            Log.w(TAG, "init: GPU failed, falling back to CPU", gpuErr)
        }

        val mp = create(useGpu = false)
        instance = mp
        usingGpu = false
        Log.i(TAG, "init: CPU OK")
        return mp
    }

    private fun create(useGpu: Boolean): MpFaceLandmarker {
        val context = NitroModules.applicationContext
            ?: throw IllegalStateException(
                "NitroModules.applicationContext is null — cannot init MediaPipe FaceLandmarker",
            )

        val baseOptions = BaseOptions.builder()
            .setModelAssetPath("face_landmarker.task")
            .setDelegate(if (useGpu) Delegate.GPU else Delegate.CPU)
            .build()

        val options = MpFaceLandmarker.FaceLandmarkerOptions.builder()
            .setBaseOptions(baseOptions)
            .setRunningMode(RunningMode.VIDEO)
            .setNumFaces(1)
            .setMinFaceDetectionConfidence(0.5f)
            .setMinFacePresenceConfidence(0.5f)
            .setMinTrackingConfidence(0.5f)
            .build()

        return MpFaceLandmarker.createFromOptions(context, options)
    }
}
