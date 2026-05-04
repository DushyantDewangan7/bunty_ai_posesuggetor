# Resume marker — Phase 1 Track A, step 3b.5

**Last successful action:** Full Android app build with VC v5 frame-output + Nitro plugin smoke-test wiring.

```
BUILD SUCCESSFUL in 2m 3s
android/app/build/outputs/apk/debug/app-debug.apk  (104,800,286 bytes)
```

## What's already done in this session

- ✅ ADR-001 written at `docs/decisions/ADR-001-pose-detection-architecture.md`
- ✅ `react-native-mediapipe` uninstalled; `react-native-nitro-modules` + `nitrogen` (dev) + `react-native-vision-camera-worklets` installed and pinned
- ✅ Nitrogen no-op plugin scaffolded:
  - `src/native/PoseLandmarker.nitro.ts` — TS spec
  - `nitro.json` — codegen config
  - `android/nitrogen/generated/` — generated Kotlin/C++/JNI bridge
  - `android/poseplugin/` — Gradle library module (build.gradle, CMakeLists.txt, AndroidManifest.xml, cpp-adapter.cpp with JNI_OnLoad)
  - `android/poseplugin/src/main/java/com/margelo/nitro/aiposesuggestor/poseplugin/HybridPoseLandmarker.kt` — implementation (returns `"pong from Kotlin (no-op stub)"` for `ping()`)
  - `android/poseplugin/src/main/java/com/aiposesuggestor/poseplugin/PosePluginInitializer.kt` — load wrapper (called from `MainApplication.onCreate()`)
- ✅ `android/build.gradle` has the `subprojects { afterEvaluate { ndkVersion } }` hook to fix the worklets-core NDK conflict
- ✅ `android/app/src/main/java/com/growthbyte/aiposesuggestor/MainApplication.kt` calls `PosePluginInitializer.init()` on `onCreate()`
- ✅ `src/native/poseLandmarkerNative.ts` — JS-side `getPoseLandmarker()` accessor
- ✅ Step 3b smoke test (JS-thread `ping()`) verified working on device: log `[PosePlugin] ping → pong from Kotlin (no-op stub)` was observed in metro.log
- ✅ Step 3b.5 sub-steps 1–5 resolved: camera startup error was a stale-state ghost; preview renders cleanly now, no popup needed (permission already granted from Phase 0). User confirmed live back-camera feed visible.
- ✅ Step 3b.5 sub-step 6 SCAFFOLDED but **not yet validated on device**: `src/ui/screens/CameraScreen.tsx` now imports `useFrameOutput` and registers a frame processor whose worklet calls `poseLandmarker.ping()` once on the first frame. This is what the next session needs to verify.

## What the next session needs to do

The APK at `android/app/build/outputs/apk/debug/app-debug.apk` already contains the worklet-side ping wiring. We have **not yet installed it or watched logcat**.

Resume sequence:

```bash
# 1. open a fresh shell, cd into D:\projects\aiposedetector

# 2. attach the device via USB, confirm
export PATH="/d/Android/Sdk/platform-tools:$PATH"
adb devices                # expect R9ZR90PGTFD device

# 3. set up port forward (Dev Client reaches Metro)
adb reverse tcp:8081 tcp:8081

# 4. install the APK we built (no rebuild needed — it's current as of 2026-04-29 17:21)
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# 5. start Metro
export ANDROID_HOME="/d/Android/Sdk" \
  GRADLE_USER_HOME="D:/projects/aiposedetector/.cache/gradle" \
  TMPDIR="D:/projects/aiposedetector/.cache/tmp"
nohup npx expo start --dev-client --clear > metro.log 2>&1 &

# 6. clear logcat, force-stop & relaunch app
adb logcat -c
adb shell am force-stop com.growthbyte.aiposesuggestor
adb shell am start -n com.growthbyte.aiposesuggestor/.MainActivity

# 7. watch for the success markers
adb logcat | grep --line-buffered -E "PosePlugin|FATAL|ClassNotFound"
```

**Success markers to confirm:**

- `[PosePlugin] JS-thread ping → pong from Kotlin (no-op stub)` (already validated in step 3b)
- `[PosePlugin] worklet-thread first-frame ping → pong from Kotlin (no-op stub)` ← **this is the new step 3b.5 marker we still need to see**
- Camera preview renders live back-camera feed (already validated)
- No `ClassNotFound`, no `FATAL EXCEPTION` from `PosePlugin` / `HybridPoseLandmarker`

**If those markers fire, step 3b.5 is done.** Then:
1. Update README §"Decisions" with §8 entry: `react-native-vision-camera-worklets` added (sister Margelo package, mandatory for VC v5 frame output, pinned at 5.0.8 — same version as VC core).
2. Add ADR-001 §"Gotchas discovered" mini-section listing: NDK rootProject hook, missing JNI_OnLoad / cpp-adapter, implementation FQN must match `com.margelo.nitro.<namespace>`, vision-camera-worklets dep, Gradle script-cache corruption recovery via `rm -rf .cache/gradle/caches/8.14.3/{groovy-dsl,scripts,scripts-remapped,kotlin-dsl}`.
3. Commit: `Phase 1 Track A 3b.5: Vision Camera v5 frame output + Nitro plugin worklet-call validated`
4. Tag: `phase-1-track-a-3b5-complete`
5. Move to step 3c (MediaPipe initialization with GPU/CPU fallback) per the ADR's incremental plan.

## Useful state pointers

- `metro.log` and `full-build.log` at project root (gitignored) hold the historical session output.
- `docs/decisions/ADR-001-pose-detection-architecture.md` is the canonical architecture record.
- `nitro.json` and `src/native/PoseLandmarker.nitro.ts` are the codegen inputs. To regenerate Kotlin/C++ bridge after editing the spec: `npx nitrogen --out android/nitrogen/generated`.
- The Gradle script cache at `.cache/gradle/caches/8.14.3/{groovy-dsl,scripts,...}` can corrupt on Windows after a file-lock event; `rm -rf` those subfolders to recover (build still finishes in ~2 min thanks to the rest of the cache being intact).
- All env vars (`ANDROID_HOME`, `ANDROID_NDK_ROOT`, `GRADLE_USER_HOME`, etc.) are set per-shell in this project — they are NOT persisted in the Windows User registry. Inline-export at the top of any shell that needs them.

## Where ADR's revisit triggers stand

None tripped. Plugin scaffolding works as documented. `react-native-vision-camera-worklets` was a forced add (not on original allowlist, but it's the canonical Margelo sister package for VC v5 frame processing).
