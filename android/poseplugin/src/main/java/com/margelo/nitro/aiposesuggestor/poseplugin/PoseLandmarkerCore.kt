package com.margelo.nitro.aiposesuggestor.poseplugin

import android.util.Log
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker as MpPoseLandmarker
import com.margelo.nitro.NitroModules

// Singleton owner of the MediaPipe `PoseLandmarker` so both the
// `HybridPoseLandmarker.warmup()` control-plane call and the
// `HybridPoseLandmarkerOutput` analyzer share one model instance and one
// timestamp stream. RunningMode.VIDEO requires monotonically increasing
// timestamps per landmarker — sharing the instance keeps that contract.
internal object PoseLandmarkerCore {

    private const val TAG = "PosePluginCore"

    @Volatile
    private var instance: MpPoseLandmarker? = null
    @Volatile
    var usingGpu: Boolean = false
        private set

    @Synchronized
    fun ensureInitialized(): MpPoseLandmarker {
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

    private fun create(useGpu: Boolean): MpPoseLandmarker {
        val context = NitroModules.applicationContext
            ?: throw IllegalStateException(
                "NitroModules.applicationContext is null — cannot init MediaPipe",
            )

        val baseOptions = BaseOptions.builder()
            .setModelAssetPath("pose_landmarker_lite.task")
            .setDelegate(if (useGpu) Delegate.GPU else Delegate.CPU)
            .build()

        val options = MpPoseLandmarker.PoseLandmarkerOptions.builder()
            .setBaseOptions(baseOptions)
            .setRunningMode(RunningMode.VIDEO)
            .setNumPoses(1)
            .setMinPoseDetectionConfidence(0.5f)
            .setMinPosePresenceConfidence(0.5f)
            .setMinTrackingConfidence(0.5f)
            .build()

        return MpPoseLandmarker.createFromOptions(context, options)
    }
}
