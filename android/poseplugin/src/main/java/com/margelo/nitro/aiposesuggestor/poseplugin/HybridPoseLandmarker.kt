// Control-plane hybrid for MediaPipe pose-landmark init. Per ADR-001 G14
// (2026-05-03), per-frame inference lives in `HybridPoseLandmarkerOutput`;
// this hybrid only carries `ping()` for diagnostics and `warmup()` for
// pre-init. Both delegate to `PoseLandmarkerCore` so the warmed instance is
// the same one the Output analyzer uses.

package com.margelo.nitro.aiposesuggestor.poseplugin

import android.util.Log

class HybridPoseLandmarker : HybridPoseLandmarkerSpec() {

    override fun ping(): String {
        Log.d(TAG, "ping called from JS")
        return "pong from Kotlin"
    }

    override fun warmup(): Boolean {
        return try {
            PoseLandmarkerCore.ensureInitialized()
            true
        } catch (e: Throwable) {
            Log.e(TAG, "warmup: both GPU and CPU init failed", e)
            false
        }
    }

    companion object {
        private const val TAG = "PosePlugin"
    }
}
