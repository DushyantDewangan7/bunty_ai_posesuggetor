package com.margelo.nitro.aiposesuggestor.poseplugin

/**
 * Public entry point for initializing the native AIPoseSuggestorPosePlugin
 * library. Wraps the Nitrogen-generated [AIPoseSuggestorPosePluginOnLoad]
 * which is declared `internal` (same-module-only) and therefore not visible
 * to `:app` now that the Nitrogen Kotlin sources live in `:poseplugin`.
 *
 * Call from `MainApplication.onCreate()` before `loadReactNative(this)`.
 * Idempotent — safe to call more than once. See ADR-001 G2 + G13.
 */
object PosePluginInit {
    @JvmStatic
    fun initializeNative() {
        AIPoseSuggestorPosePluginOnLoad.initializeNative()
    }
}
