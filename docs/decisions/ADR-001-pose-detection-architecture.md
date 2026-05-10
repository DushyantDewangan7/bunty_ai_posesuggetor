# ADR-001: Pose Detection Architecture

- **Status:** Accepted (2026-04-29)
- **Phase:** 1 Track A
- **Supersedes:** N/A
- **Authors:** Phase 1 Track A escalation chain

## Context — the problem

Phase 0 deliberately settled on Vision Camera v5 + Reanimated 4 (matching Expo SDK 54's compatibility matrix). When Phase 1 Track A began, we attempted to adopt `react-native-mediapipe@0.6.0` as the spec instructed. Inspection of its source revealed it directly imports `useFrameProcessor`, `VisionCameraProxy`, and `runAtTargetFps` from `react-native-vision-camera`:

```ts
// node_modules/react-native-mediapipe/src/poseDetection/index.ts
import { VisionCameraProxy, runAtTargetFps, useFrameProcessor, ... } from 'react-native-vision-camera';
```

**Vision Camera v5 has removed all three from its public API.** v5 is a Nitro-Modules rewrite that replaced the `frameProcessor` prop / `VisionCameraProxy.initFrameProcessorPlugin()` plugin model with a `<Camera outputs={[...]}>` model + Nitro `HybridObject` plugins. There is no shim. `react-native-mediapipe@0.6.0` is **fundamentally incompatible** with VC v5; its peer-dep wildcard `react-native-vision-camera: '*'` masked the incompatibility through `npm install`, but the JS bundle would crash at module-load time.

The decision was forced: pick another path or ship without pose detection.

## Options considered

### Option 1 — Downgrade Vision Camera to v4.x — REJECTED

Reverses Phase 0's deliberate "Option 1" decision. Forces Reanimated 4 → 3 cascade, fights Expo SDK 54's compatibility matrix, loses the New Architecture refactor v5 brought, opens fresh peer-dep conflicts. High blast radius for a lateral move.

### Option 2 — Find a fork or alternative npm package with VC v5 support — REJECTED (researched)

30-minute survey:

- Upstream `cdiddy77/react-native-mediapipe`: last substantive commit 2025-08-13, issue #154 ("Migrating to RN's new architecture?") open since 2024-10 with 0 maintainer comments, no `v5` / `next` / `migration` branch, zero issues mentioning VC v5 — effectively abandoned.
- Top 6 most-recently-pushed forks: all still import `useFrameProcessor` / `VisionCameraProxy` from VC v3/v4. Zero v5 migrations.
- npm alternatives: `react-native-mediapipe-pose-plugin@0.1.0` (most promising candidate) is 3-week-old, single-author, 0-star, native-only-no-JS-API, validated explicitly on VC v4.7.3 not v5, requires the same removed `VisionCameraProxy` JS proxy API. Other candidates (`@gymbrosinc/react-native-mediapipe-pose`, `react-native-mediapipe-posedetection`, `pose-landmarker-react-native`, `pose-ai-core`) are stale, web-only, or uncertified.
- **No viable VC v5 + MediaPipe Pose binding exists on npm or GitHub.**

### Option 3 — Use `react-native-fast-tflite` directly with `pose_landmarks_detector.tflite` — REJECTED (cost/risk)

The `.task` file MediaPipe ships is a **bundle of two `.tflite` models** (`pose_detector.tflite` + `pose_landmarks_detector.tflite`) plus the orchestration logic that runs detection only on first/lost frames and tracks ROI from previous landmarks for all other frames. Using just the landmarker `.tflite` without the detector + ROI tracker either:

- runs the detector every frame (doubles inference cost, blows the 60ms budget on Snapdragon 480), or
- feeds full uncropped frames to a model trained on tight ROI crops (output mostly incorrect, per Google's MediaPipe issue tracker).

Salvaging quality requires implementing detector→tracker orchestration + temporal smoothing in JS. Effort estimate inflated from ~2–3 days to **5–7 days**, with quality risk that may need on-device tuning. We'd own a load-bearing custom JS ML pipeline forever.

### Option 4 — Custom Vision Camera v5 frame-processor plugin (Kotlin / Swift) wrapping MediaPipe Tasks — **ACCEPTED**

See _Decision_ below.

### Option 5 — Wait for upstream `react-native-mediapipe` to support VC v5 — REJECTED

Equivalent to Option 1 with a delay. Upstream has not engaged with the v5 migration in 18 months despite open issues. No timeline.

## Decision — Option 4

Write a small native frame-processor plugin in Kotlin (Android) — Swift later for iOS — that wraps Google's official MediaPipe Tasks Java SDK (`com.google.mediapipe:tasks-vision`), exposed to JS via `react-native-nitro-modules`. The plugin lives in our project, is called from the worklet body of `useFrameOutput`'s `onFrame`, and returns landmark arrays through Nitro's typed JSI bindings.

### Why Option 4 over Option 3 (the runner-up)

- Native MediaPipe Tasks SDK gives us detector + tracker + ROI cropping + temporal smoothing for free — the same pipeline Google ships in their reference apps.
- Effort delta is small: 6–8 days vs 5–7 days. The reference codebases (below) collapse most unknowns.
- Long-term maintenance is much lower: thin wrapper around the official Google SDK vs custom JS ML pipeline.
- Quality risk: lower. Google validated the tracker. JS-side tracker (Option 3) is unvalidated on our target device.

## Reference implementations

Two open-source codebases combine to cover ~80% of the work:

1. **[`react-native-vision-camera-barcode-scanner`](https://github.com/mrousavy/react-native-vision-camera/tree/main/packages/react-native-vision-camera-barcode-scanner)** (the **VC v5 plugin pattern**) — first-party Nitro plugin shipped at the same `5.0.8` version as VC core. Authored by Margelo (the VC author org). 39-line `HybridBarcodeScanner.kt` is the canonical worklet-callable plugin shell. We copy its skeleton and substitute MediaPipe.

2. **[`react-native-mediapipe-pose-plugin/android/.../PoseLandmarkerFrameProcessorPlugin.kt`](https://github.com/munishbp/react-native-mediapipe-pose-plugin/blob/main/android/src/main/java/com/poselandmarker/PoseLandmarkerFrameProcessorPlugin.kt)** (the **MediaPipe Kotlin core**, ~605 lines) — VC v4-targeted, but the MediaPipe-specific code is portable: ~70–80% reusable.

   Reusable as-is:
   - `PoseLandmarker` initialization (`BaseOptions`, `Delegate`, `RunningMode.VIDEO`, model asset path)
   - **Lazy initialization on first frame** (works around MediaPipe GPU delegate's thread-affinity requirement that crashes if init runs on the wrong thread)
   - **GPU → CPU fallback** logic per landmarker (handles known Mali / older Adreno crashes)
   - Frame → `MPImage` conversion via `MediaImageBuilder`
   - Nanosecond → millisecond timestamp conversion with monotonicity-collision guard (MediaPipe rejects same-ms timestamps from rapid frames; this code force-advances on collision)
   - `PoseLandmarkerResult` → result map extraction (33 landmarks × x/y/z/visibility)

   Rewrite for v5 (~20–30%):
   - Class extends `FrameProcessorPlugin` (v4) → `HybridXxxSpec` (v5 Nitrogen-generated)
   - Registration via `VisionCameraProxy.initFrameProcessorPlugin('poseLandmarker', {})` (v4) → Nitrogen autolinking via `nitro.json` (v5)
   - `Frame` import from `com.mrousavy.camera.frameprocessors.Frame` (v4) → `HybridFrameSpec` cast to `NativeFrame` (v5)

## Estimated effort and risk profile

| Sub-task                                                                      | Estimate                                  | Status                                                |
| ----------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| `*.nitro.ts` spec + `nitro.json` config                                       | 2–3 hours                                 | scaffolding                                           |
| Nitrogen codegen + first build (Windows)                                      | 4–6 hours                                 | **time-boxed at 4 h — STOP if no codegen output**     |
| Kotlin plugin (barcode scanner shell + munishbp's MediaPipe core, glued)      | 1.5–2 days                                | core work                                             |
| iOS Swift mirror                                                              | **deferred** — Phase 0/1 are Android-only | out of scope                                          |
| JS hook (`usePoseDetector`) + Zustand wiring + worklet call site              | 0.5 day                                   | trivial                                               |
| Model file bundling (`android/app/src/main/assets/pose_landmarker_lite.task`) | 0.5 day                                   | mediapipe docs                                        |
| First on-device build + landmark verification (A22)                           | 1.5–2 days                                | **time-boxed at 1 day — STOP if no landmarks render** |
| Buffer for Nitrogen tooling quirks on Windows                                 | 1 day                                     | empirical                                             |

**Best 5 days, expected 7, worst 8.**

## Acceptance criteria (unchanged from original Track A spec)

- Sustained 15+ FPS pose detection on Samsung A22 (Snapdragon 480, 4 GB)
- Inference latency < 60 ms
- Battery drain < 5% per 5 minutes of active use
- Memory peak < 250 MB
- Zustand contract (`PoseFrame`, `NormalizedPoseFrame` in `usePoseStream`) unchanged — Track B sees no difference

## When to revisit this decision

Trigger a fresh ADR if any of the following holds:

- **Vision Camera v5's plugin / Nitro API churns** in a way that breaks our plugin's source compatibility (track Margelo's release notes on minor-version bumps).
- **An official `react-native-mediapipe` (or comparable) v5 binding gets published** and is maintained actively for ≥ 3 months with stars > 200 and CI green. At that point the maintenance argument flips: their wrapper > our wrapper.
- **Phase 4+ adds Face Landmarker / Hand Landmarker / Object Detector**, at which point the "build our own per-feature wrapper" cost compounds and a community library becomes more attractive.
- **Performance fails on Snapdragon 480** (sustained < 15 FPS, > 60 ms inference, > 250 MB memory). May force a switch to Option 3 with custom JS smoothing, or to a lighter MediaPipe variant.

## Time-box circuit breakers

If either of these trips, STOP and escalate before continuing:

1. **Nitrogen codegen — 4 hours.** If a "hello world" `*.nitro.ts` spec is not producing Kotlin output by hour 4, we hit a tooling issue worth checkpointing (Windows-specific Nitrogen issues are known and documented in `mrousavy/nitro` issues).
2. **First on-device landmark render — 1 day.** If after a full day on the Samsung A22 we cannot render any landmarks (even garbage ones), the issue is likely model loading, frame format, or threading — none of which is a "keep trying" problem; it's a "checkpoint and figure out which" problem.

## Step plan (each step = a working app)

1. **No-op Nitrogen plugin** compiling and callable from JS (no MediaPipe yet). Verifies VC v5 plugin scaffolding on Windows + the A22. **DONE — step 3b on 2026-04-29.**
2. **Worklet-thread call validated** (frame-processor `onFrame` calls plugin successfully on real frames). **DONE — step 3b.5 on 2026-04-29.**
3. Add MediaPipe initialization (lazy-init, GPU/CPU fallback). Verify the model loads without crashing.
4. Add inference. Output raw landmarks with no normalization, just to confirm the pipeline works.
5. Add normalization and Zustand wiring.
6. Performance audit on A22 against the Track A acceptance checklist.

## Gotchas discovered while scaffolding (steps 3b + 3b.5)

These were not anticipated when this ADR was written. Document them so the iOS Swift port and any future Nitro plugin in this codebase can skip the same potholes.

### G1. `react-native-worklets-core` triggers `[CXX1104]` NDK version mismatch on Android

Other RN libs (Vision Camera, Skia, Reanimated, Nitro) read `rootProject.ext.ndkVersion` and inherit our NDK r27b (`27.1.12297006`). `react-native-worklets-core@1.6.3` doesn't set its own `ndkVersion` and AGP falls back to its compile-time default (`27.0.12077973`), which mismatches our `ndk.dir`. Fix: add a `subprojects { afterEvaluate { ... } }` hook in root `android/build.gradle` to force-align all submodules to `rootProject.ext.ndkVersion`. The hook **must be registered before** `apply plugin: "expo-root-project"` and `apply plugin: "com.facebook.react.rootproject"` — those evaluate subprojects eagerly.

### G2. `JNI_OnLoad` is the user's responsibility, not Nitrogen's

Nitrogen generates `<Module>OnLoad.cpp` containing `registerAllNatives()` that populates `HybridObjectRegistry`, but **does not** define `JNI_OnLoad`. Without one, `System.loadLibrary("…")` succeeds but the registry stays empty and JS-side `NitroModules.createHybridObject('…')` throws `Cannot create an instance of HybridObject "…" - It has not yet been registered`. Add a small `cpp-adapter.cpp` that defines `JNI_OnLoad` and calls `registerAllNatives()` inside a `facebook::jni::initialize(vm, ...)`. Add it to your `CMakeLists.txt`'s `add_library(... cpp-adapter.cpp)`.

### G3. Hybrid implementation class FQN must match `com.margelo.nitro.<your-namespace>`

The Nitrogen-generated C++ JNI bridge looks up the Kotlin implementation by full qualified name (see `kJavaDescriptor` in `…OnLoad.cpp`). The FQN follows `com.margelo.nitro.` + whatever you set as `androidNamespace` in `nitro.json` (e.g. `["aiposesuggestor", "poseplugin"]` → `com.margelo.nitro.aiposesuggestor.poseplugin`). The implementation must live in **that exact package** — putting it in your app's namespace (e.g. `com.aiposesuggestor.poseplugin`) throws `ClassNotFoundException` at `createHybridObject` time. Match the barcode-scanner reference's convention: implementation lives in the same package as the generated spec.

### G4. C++ standard must be 20, not 17

Nitro Modules headers use `std::unordered_map::contains` (C++20). Your plugin's `CMakeLists.txt` must set `CMAKE_CXX_STANDARD 20` — the default 17 fails compilation with `error: no member named 'contains' in 'std::unordered_map<…>'`.

### G5. Vision Camera v5 needs the sister package `react-native-vision-camera-worklets`

`useFrameOutput` requires `react-native-vision-camera-worklets@5.0.8` to be installed. It's a separate npm package shipped in the same Margelo monorepo as VC core. Without it, the worklet thread that runs `onFrame` doesn't exist — there's no error at install time, but the app silently has no frame processor.

### G6. Windows Gradle script-cache corruption recovery

Windows file-lock events (e.g. when a build is interrupted) can corrupt `.cache/gradle/caches/8.14.3/{groovy-dsl,scripts,scripts-remapped,kotlin-dsl}` such that the next build fails with cryptic errors like "does not specify compileSdk in build.gradle" — even though the build.gradle clearly does. The fix is `rm -rf` those four subfolders. The rest of the cache (downloaded jars, transforms, file-hashes) is preserved, so the rebuild still completes in ~2 minutes.

### G7. Metro file-watcher chokes on stale `react-native-vision-camera-worklets/android/build/generated/source/codegen/` paths

After a Gradle build, the codegen folder contains entries that Metro's `metro-file-map` watcher fails to `lstat` (Windows-specific). Symptom: Metro crashes at startup with `Error: UNKNOWN: unknown error, lstat '...\codegen\?\D:\...'`. Fix: `rm -rf node_modules/react-native-vision-camera-worklets/android/build` before starting Metro after a build. (May also affect VC core's generated codegen directory — same recipe.)

### G9. ⚠️ DEPRECATED — see G12 and G13

Original guidance was to place the project's CMakeLists.txt at `android/CMakeLists.txt` (sibling to `android/app/`) and point `android/app/build.gradle`'s `externalNativeBuild { cmake { path "../CMakeLists.txt" } }` at it, so that Nitrogen's `../nitrogen/...` relative paths resolve from `android/` to the repo-root `nitrogen/`.

**This was wrong on Expo.** Setting `:app`'s `externalNativeBuild.cmake.path` silently disables the React Native Gradle Plugin's installation of its own default CMakeLists, so `libappmodules.so` is never built and the New Architecture runtime crashes at startup with `TurboModuleRegistry.getEnforcing(...): 'PlatformConstants' could not be found` followed by `AppRegistryBinding::startSurface failed. Global was not installed.` See G12 for the failure mechanism and G13 for the correct placement (Nitro plugin in its own Gradle subproject under `android/<plugin>/`).

### G8. `expo-dev-client` Dev Launcher always intercepts cold launches

`adb shell am start` of MainActivity lands on `DevLauncherActivity`, not your app, because `expo-dev-client` registers itself as the launch interceptor. To load the actual JS bundle: either tap the "localhost:8081" entry on the device's DevLauncher screen, or use `adb shell am start -W -a android.intent.action.VIEW -d "exp+<slug>://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`. Stale `ReactActivityDelegate.onKeyDown` NPEs during the first launch are common — they kill the process but the next launch attempt usually succeeds once the bundle has compiled.

### G10. Cross-module HybridObject use requires manual `find_package()` + `target_link_libraries()` in the consumer's CMakeLists.txt

When a Nitro plugin consumes a `HybridXxx` from another Nitro module (e.g. our pose plugin uses Vision Camera v5's `HybridFrame`), Nitrogen 0.35.6 emits the `#include <External/HybridXxx.hpp>` header reference but does **not** auto-add the corresponding `find_package` / link directive. The build fails at link time with unresolved JNI symbols even though headers resolve.

Pattern in the consumer's CMakeLists.txt:

```cmake
find_package(react-native-vision-camera REQUIRED CONFIG)
target_link_libraries(${PROJECT_NAME} react-native-vision-camera::VisionCamera)
```

Also requires `buildFeatures { prefab true }` in the consumer's `android/app/build.gradle` so AGP exposes the upstream module's prefab `.aar` to CMake. Without `prefab`, `find_package` silently returns nothing and the missing-symbol failure looks identical to a typo.

### G11. Reaching `android.media.Image` from a Vision Camera v5 `Frame` inside a Nitro plugin

To pass a camera frame into MediaPipe's `MediaImageBuilder`, you need the underlying `android.media.Image`. From a VC v5 `HybridFrameSpec` argument in Kotlin:

```kotlin
@OptIn(androidx.camera.core.ExperimentalGetImage::class)
fun process(frame: HybridFrameSpec) {
    val mediaImage: android.media.Image = (frame as NativeFrame).image.image
    // ...
}
```

The cast goes `HybridFrameSpec → NativeFrame`, then `.image` returns CameraX's `ImageProxy`, and the second `.image` is `ImageProxy.getImage()` which is annotated `@ExperimentalGetImage` in `androidx.camera:camera-core` 1.7.0-alpha01+. The calling Kotlin function (or the file/class) needs `@OptIn(androidx.camera.core.ExperimentalGetImage::class)` or compilation fails with an opt-in error.

Additionally: the consuming module needs an explicit `androidx.camera:camera-core` dependency at compile time, because Vision Camera declares CameraX as `implementation` (not `api`), so its symbols aren't transitively available on the consumer's classpath.

```gradle
// consumer's android/build.gradle (or app/build.gradle)
implementation "androidx.camera:camera-core:1.7.0-alpha01"  // match VC v5's pinned version
```

Symptom without this dep: `Frame.image` resolves at the IDE level (because Kotlin metadata is on the Maven artifact) but `javac`/`kotlinc` fails at the second `.image` access with "cannot find symbol class ImageProxy".

### G12. Don't hijack `:app`'s `externalNativeBuild` on Expo + RN New Architecture

The React Native Gradle Plugin's `NdkConfiguratorUtils.kt` (`node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/src/main/kotlin/com/facebook/react/utils/NdkConfiguratorUtils.kt:32-38`) installs RN's default app-setup `CMakeLists.txt` only if the user has not already set one:

```kotlin
// If the user has not provided a CmakeLists.txt path, let's provide
// the default one from the framework
if (ext.externalNativeBuild.cmake.path == null) {
  ext.externalNativeBuild.cmake.path =
      File(extension.reactNativeDir.get().asFile,
           "ReactAndroid/cmake-utils/default-app-setup/CMakeLists.txt")
}
```

That default CMakeLists is what compiles the autolinking JNI sources at `android/app/build/generated/autolinking/src/main/jni/` into `libappmodules.so` — the unified TurboModule binding library that the RN runtime calls `TurboModuleRegistry.getEnforcing('PlatformConstants')` against on first surface render. Setting your own `path` in `:app`'s `externalNativeBuild { cmake }` block bypasses this hook **with no error or warning**. The `:app:configureCMakeDebug` and `:app:buildCMakeDebug` tasks still run — but they run *your* CMakeLists, not RN's. As side-effects:

- `libappmodules.so` is missing from the APK (verify with `Get-ChildItem android/app/build/intermediates/merged_native_libs -Recurse -Filter libappmodules.so`).
- `:app:generateCodegenSchemaFromJavaScript` and `:app:generateCodegenArtifactsFromSchema` get marked `SKIPPED` (no externalNativeBuild dependency chain triggers them).
- The app boots far enough to load every third-party Nitro `.so`, the dev launcher's native overlay even renders, then the JS runtime fails:

```
E/ReactNativeJS: [runtime not ready]: Invariant Violation: TurboModuleRegistry.getEnforcing(...): 'PlatformConstants' could not be found.
E/ReactNativeJS: [runtime not ready]: Error: Non-js exception: AppRegistryBinding::startSurface failed. Global was not installed.
```

The screen stays empty. Misleading for two reasons: every other `.so` loads correctly, so the SoLoader trace looks healthy at a glance; and the only early hint is one `W/SoLoader: Failed to recover` line about `libappmodules.so` that's easy to dismiss as benign init-time noise.

**Rule:** never set `externalNativeBuild { cmake { path } }` inside `:app/build.gradle` on a New-Architecture-enabled Expo or RN project. If you have your own native code, put it in its own Gradle module (G13).

### G13. Nitro plugin lives in its own Gradle subproject — but CMakeLists location is dictated by Nitrogen, not Gradle

A custom Nitro plugin built with Nitrogen-generated autolinking should live in its own Gradle subproject (e.g. `:poseplugin`), but the **CMakeLists.txt that drives the native build must be located one directory level above the project's `nitrogen/` directory**. On this project that means `CMakeLists.txt` at `android/` (one level above repo-root `nitrogen/`), with `:poseplugin`'s `externalNativeBuild` pointing up to `../CMakeLists.txt`.

This is because Nitrogen's generated `<Module>+autolinking.cmake` uses bare `../nitrogen/...` relative paths that CMake resolves against the **includer's** `CMAKE_CURRENT_SOURCE_DIR` (CMake's `include()` does not change that variable). The autolinking file is marked DO NOT MODIFY — adjust the consumer's location instead.

**The CMakeLists' physical location is dictated by Nitrogen's path constraint. Which Gradle module owns the build target is a separate Gradle-side concern. These two concerns can and should be decoupled** — a Gradle module's `externalNativeBuild { cmake { path } }` can point anywhere, including up and out of the module dir.

**Layout on this project:**

```
repo-root/
  nitrogen/                       ← Nitrogen output (DO NOT MODIFY)
    generated/
      android/AIPoseSuggestorPosePlugin+autolinking.cmake
      ...
  android/
    CMakeLists.txt                ← drives the Nitro plugin native build. CMAKE_CURRENT_SOURCE_DIR = android/, so ../nitrogen/ → repo-root nitrogen/ ✓
    settings.gradle               ← include ':poseplugin'
    app/
      build.gradle                ← NO externalNativeBuild. dependencies { implementation project(':poseplugin') }
    poseplugin/
      build.gradle                ← com.android.library, prefab true (G10), externalNativeBuild { cmake { path '../CMakeLists.txt' } }
      src/main/
        AndroidManifest.xml       ← minimal <manifest/>; namespace lives in build.gradle
        cpp/cpp-adapter.cpp       ← JNI_OnLoad (G2)
        java/com/margelo/nitro/<ns>/poseplugin/Hybrid<Spec>.kt  ← G3 FQN match
        assets/<model>.task       ← MediaPipe model file
```

**Source-set addition for Nitrogen-generated Kotlin** (in `:poseplugin/build.gradle`):
```gradle
android.sourceSets.main.java.srcDirs += ["${rootProject.projectDir}/../nitrogen/generated/android/kotlin"]
```
`rootProject.projectDir = android/` regardless of which module's `build.gradle` this lives in, so `../nitrogen/...` resolves to repo-root `nitrogen/...` from any module.

**`:poseplugin/build.gradle` dependencies:**
- `implementation project(':react-native-nitro-modules')` — Nitro core symbols (`NitroModules`)
- `implementation project(':react-native-vision-camera')` — cross-module `HybridFrameSpec` (G10)
- `api 'com.google.mediapipe:tasks-vision:0.10.21'` — MediaPipe (use `api` if `:app` also needs the symbols, else `implementation`)
- `api 'androidx.camera:camera-core:1.7.0-alpha01'` — pinned to VC v5's bundled version (G11)

`buildFeatures { prefab true }` (G10) goes in `:poseplugin/build.gradle`, not `:app`'s.

### G14. Worklet-callable factory hybrids hit unfixable Variant marshalling — switch to Output-attached pattern (2026-05-03)

**The crisis.** The original Step plan called for a worklet-callable `PoseLandmarkerFactory.create()` that returns a `PoseLandmarker` hybrid whose `detect(frame)` is invoked from a Vision Camera v5 frame-processor worklet. Both directions of marshalling broke:

1. **Worklet → Hybrid call** — calling a JSI host function from a worklet runtime crashed inside Nitro's `Variant`-based return-value marshalling whenever the return type was anything richer than a primitive. Even returning `void` and writing into a callback-ref hit the same code path because Nitro wraps both directions through `Variant`. There is no Nitrogen knob that disables this; the published Vision Camera v5 plugins (`barcode-scanner`, `face-detector`) all avoid the path entirely.

2. **Hybrid → Worklet callback** — symmetric problem in reverse: trying to invoke a worklet-thread callback from native required the same `Variant` machinery and crashed identically.

**The fix.** Drop the worklet path. Adopt the **Output-attached** pattern that vision-camera's published plugins use:
- The Output is itself a Nitro Hybrid (`HybridPoseLandmarkerOutput`) extending `CameraOutput` (vision-camera's spec) plus implementing the Android side's `NativeCameraOutput` interface.
- The Output owns its own `androidx.camera.core.ImageAnalysis` UseCase, returned from `createUseCase()`.
- Inference runs entirely on the analyzer thread inside the Output's `analyze()` callback. **No worklet, no JSI host call from a worklet runtime.**
- Results are pushed back to the main JS runtime via a regular Nitro callback (`setOnResultsCallback`) — that callback fires on the main thread and can drive a Zustand store directly. No `Variant` round-trip.
- JS uses it as `<Camera outputs={[poseOutput]} />` where `poseOutput` is built by `NitroModules.createHybridObject<PoseLandmarkerOutput>('PoseLandmarkerOutput')` and stored in a hook.

Reference: `react-native-vision-camera-barcode-scanner`'s `HybridBarcodeScannerOutput.kt` is the canonical Android implementation. Vision-camera's own `HybridCameraObjectOutputSpec` is the type signature we extend.

**Sub-fix #1: `MediaImageBuilder` requires RGBA, but CameraX defaults to YUV.** MediaPipe Tasks Vision' `MediaImageBuilder(android.media.Image).build()` only accepts `ImageFormat.YUV_420_888` and `PixelFormat.RGBA_8888`, but on most Samsung MediaTek cameras `image.image.format` is `35 (YUV_420_888)` and the YUV path crashes intermittently in MediaPipe's native code. The clean fix is to ask CameraX for RGBA up front:
```kotlin
ImageAnalysis.Builder()
  .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
  .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
```
`OUTPUT_IMAGE_FORMAT_RGBA_8888` is supported since CameraX 1.3; our pinned `androidx.camera:camera-core:1.7.0-alpha01` (G11) has it. This avoids hand-rolling a YUV→RGB converter (RenderScript is deprecated, libyuv adds an NDK dep).

**Sub-fix #2: Nitrogen 0.35.6 cross-namespace codegen bug.** When an Output spec extends `CameraOutput` from a *different* C++ namespace than vision-camera's own `margelo::nitro::camera`, Nitrogen emits `JHybrid<Output>Spec.{hpp,cpp}` with **unqualified** `MediaType` / `CameraOrientation` references and **local** `#include "MediaType.hpp"` style includes. These only resolve when the spec lives in the camera namespace itself; in our `margelo::nitro::aiposesuggestor::poseplugin` namespace the C++ build fails with:
```
error: unknown type name 'MediaType'; did you mean 'camera::MediaType'?
fatal error: 'MediaType.hpp' file not found
```
Vision-camera's own `HybridCameraObjectOutputSpec` doesn't hit this because it lives in `margelo::nitro::camera`. We work around it with [`scripts/patch-nitrogen.cjs`](../../scripts/patch-nitrogen.cjs), an idempotent post-codegen patcher wired into `npm run nitrogen`. It rewrites the unqualified types to `margelo::nitro::camera::MediaType` / `…::CameraOrientation` and switches the local `#include` forms to prefab-namespaced `<VisionCamera/MediaType.hpp>` / etc. Every regeneration re-runs the patcher.

**Sub-fix #3: shared MediaPipe instance, not per-Hybrid.** `HybridPoseLandmarker.warmup()` (the control-plane hybrid) and `HybridPoseLandmarkerOutput.analyze()` (the per-frame analyzer) both need the MediaPipe `PoseLandmarker`. Each owning its own instance would (a) double model RAM, (b) waste init time, (c) break `RunningMode.VIDEO`'s monotonic-timestamp contract once both run. Solution: a `PoseLandmarkerCore` singleton owns the instance with `@Synchronized` lazy init + GPU→CPU fallback. `warmup()` becomes a pre-init optimization; the Output handles lazy init on first frame as a fallback.

**Sub-fix #4: dev-launcher cache surprise.** After deleting the old factory hybrid, the device kept hitting `Cannot create instance of HybridObject "PoseLandmarkerFactory"` — even though no source file referenced it any more. Cause: a stale Metro bundle cached from before the deletion. `npx expo start --clear` (or killing the orphaned Metro process and restarting) fixes it. This is unrelated to Output architecture but the failure mode is misleading because the runtime error names the *missing native* hybrid, not the *stale JS* import.

**Performance on Samsung (R9ZR90PGTFD) — measured 2026-05-03 (debug build):**

Sustained in-frame analyzer windows (full pose detected for the entire window, GPU delegate, debug build with Metro running):

| metric                         | value (median across 14 in-frame windows) |
| ------------------------------ | -----------------------------------------: |
| analyzer FPS                   | 15.8 (range 13.8–16.8)                     |
| inference time (`detectForVideo`) | 57 ms avg (range 54–67 ms)              |
| MediaPipe delegate             | GPU                                        |
| target acceptance              | ✅ ≥15 FPS, ✅ <60 ms inference            |
| memory PSS (debug build)       | 537 MB total, 235 MB native heap (MediaPipe + GPU) |
| memory acceptance              | ⚠ debug exceeds 250 MB target — re-measure on release build (debug carries Hermes inspector, Metro, dev-tools) |

Out-of-frame windows show FPS dropping to 2–6 — these reflect the rate the *analyzer thread spins through 30 frames* when most of those frames have no pose to emit. The Output silently drops no-pose frames (no callback fires, no Zustand write, no Skia overlay redraw), so JS-side load also stays low during empty windows. The "no person" UX falls out of `usePoseStream`'s staleness check, exactly as planned.

`detectForVideo` warm path is well under the 60 ms target; the 1st-frame init cost was ~12 s in this run (`PoseLandmarkerCore: init: GPU OK` arrived 9 s after the analyzer thread started, dominated by GPU delegate setup + model decode), but that's a one-time cost and gets shorter when `warmup()` is called from JS during onboarding (we currently don't call it eagerly because the cost was tolerable).

**Files involved:**
- [src/native/PoseLandmarkerOutput.nitro.ts](../../src/native/PoseLandmarkerOutput.nitro.ts) — Output spec extending vision-camera's `CameraOutput`.
- [android/poseplugin/.../HybridPoseLandmarkerOutput.kt](../../android/poseplugin/src/main/java/com/margelo/nitro/aiposesuggestor/poseplugin/HybridPoseLandmarkerOutput.kt) — Kotlin Output: `createUseCase()` builds the RGBA `ImageAnalysis`; `analyze()` does `MediaImageBuilder(image.image).build()` → `detectForVideo` → `PoseLandmark[]` → callback.
- [android/poseplugin/.../PoseLandmarkerCore.kt](../../android/poseplugin/src/main/java/com/margelo/nitro/aiposesuggestor/poseplugin/PoseLandmarkerCore.kt) — singleton owner of MediaPipe instance with GPU→CPU fallback.
- [android/poseplugin/.../HybridPoseLandmarker.kt](../../android/poseplugin/src/main/java/com/margelo/nitro/aiposesuggestor/poseplugin/HybridPoseLandmarker.kt) — control hybrid: `ping()` + `warmup()` delegate to the singleton.
- [src/camera/usePoseLandmarkerOutput.ts](../../src/camera/usePoseLandmarkerOutput.ts) — JS hook that constructs the Output and wires its callback into `usePoseStream`.
- [scripts/patch-nitrogen.cjs](../../scripts/patch-nitrogen.cjs) — idempotent post-codegen patcher for the cross-namespace bug.

### G16. Pose match scoring — geometric, not learned (2026-05-04)

Pose match scoring uses Euclidean distance in canonical pose space (post-normalize). Each landmark's distance is weighted by visibility so occluded joints contribute less to the score. Three-state UI feedback: `far` (< 0.5), `close` (0.5–0.85), `matched` (≥ 0.85). Worst-3-joints extracted by sorting weighted distances descending, used to provide actionable hints to the user (e.g. "Adjust your right elbow"). Pure JS, runs at frame rate (33 landmark distances per frame is trivial cost). No model needed for matching — geometric.

### G17. Pose recommendation engine — weighted linear scoring with two stub components (2026-05-05)

Phase 3B introduces per-user pose recommendations. The scorer is a deterministic weighted linear combination of four components, each in `[0, 1]`:

- **Gender match (weight 0.4)** — `1.0` for matching `genderOrientation`, `0.8` for `neutral`, `0.2` for the opposite gender, `0.7` for unknown / `non_binary` / `prefer_not_to_say`. Treated as a soft signal: an opposite-gender pose is de-prioritised but never excluded.
- **Mood match (weight 0.2)** — stub returning `0.5` for now. Will be driven by interaction history (which mood tags the user taps most often) when that signal exists.
- **Use-case match (weight 0.2)** — stub returning `0.5`. Will derive from explicit setting or interaction patterns later.
- **Difficulty preference (weight 0.2)** — descending preference (`1.0` for difficulty 1, down to `0.1` for difficulty 5). With no skill data, easier poses are preferred. When per-user skill estimates exist, this is the function that should change.

Diversity scoring and difficulty progression are explicitly **deferred** until the library exceeds ~30 poses — for the current 11-pose library they would either be no-ops or produce thrashing.

**Novelty / no-repeat** is implemented as a session-scoped `shownPoseIds` set in [src/state/recommendationSession.ts](../../src/state/recommendationSession.ts), updated when the user taps any pose card. The set is **not** persisted to MMKV — it resets on app launch, which is the desired behaviour ("fresh recommendations every session"). It also feeds the `recommend` `useMemo` dependency, so within a session the For You row reorders as poses are tapped (a feature, not a bug — already-tapped poses naturally cycle out).

The scorer is split into two files specifically so it stays unit-testable: [src/recommendation/recommendCore.ts](../../src/recommendation/recommendCore.ts) holds the pure `recommendFrom(library, context)` and the four `compute*` helpers (no module-level library import), and [src/recommendation/recommend.ts](../../src/recommendation/recommend.ts) wires `RICH_POSE_LIBRARY` into a convenience `recommend(context)` for production. The pure variant lets tests pass `RichPose[]` fixtures without dragging in `react-native-mmkv` or the bundled JSON via `--experimental-strip-types`.

The library was upgraded to expose `RICH_POSE_LIBRARY: RichPose[]` alongside the existing `POSE_LIBRARY: PoseTarget[]` so the scorer reads `genderOrientation` etc. The 10 stub poses gained sensible default rich metadata; only `power-stance` (male) and `profile-left` (female) are gendered, the rest are `neutral`.

UI integration in [src/ui/components/PoseSelector.tsx](../../src/ui/components/PoseSelector.tsx) renders top-3 recommendations behind a yellow `✨ For You` label with a yellow-tinted card border, then a faint divider, then the rest of `POSE_LIBRARY` excluding the recommended IDs. The Track B match scorer (G16) is unchanged — it operates on whichever pose the user actually selects, regardless of how that pose got displayed.

Files of interest:
- [src/types/recommendation.ts](../../src/types/recommendation.ts) — `RecommendationContext`, `ScoredPose`, `RecommendationResult`.
- [src/recommendation/recommendCore.ts](../../src/recommendation/recommendCore.ts) — pure scorer (testable).
- [src/recommendation/recommend.ts](../../src/recommendation/recommend.ts) — production binding to `RICH_POSE_LIBRARY`.
- [src/recommendation/recommend.test.ts](../../src/recommendation/recommend.test.ts) — 8 unit cases (gender, novelty, limit, edge profiles).
- [src/state/recommendationSession.ts](../../src/state/recommendationSession.ts) — Zustand session-scoped shown set.
- [src/library/poseLibrary.ts](../../src/library/poseLibrary.ts) — adds `RICH_POSE_LIBRARY` and `getRichPoseById`.

### G18. Pose capture flow — captured poses live in a separate store, not the library (2026-05-05)

User-captured reference poses ("save my current pose as a target") are stored in a dedicated MMKV-backed Zustand store at [src/state/customPoses.ts](../../src/state/customPoses.ts), **not** mixed into `RICH_POSE_LIBRARY` or `POSE_LIBRARY`. The library is the curated, offline-pipeline-produced catalog; mixing user data in would conflate two different lifecycles (curated content vs. local user data) and break the recommendation engine which assumes Rich metadata. Captured poses participate in matching and selection — they're adapted to `PoseTarget` at render time via [`captureToPoseTarget`](../../src/ui/components/PoseSelector.tsx) — but stay out of the recommendation pipeline.

Schema is `CapturedPose` in [src/types/customPose.ts](../../src/types/customPose.ts), a deliberately leaner cousin of `RichPose`: only the user-supplied fields (`name`, `category`, `difficulty`) plus the two landmark arrays the runtime needs (`imageLandmarks` for ghost rendering, `referenceLandmarks` for matching). No thumbnails, no Rich metadata fields, no offline pipeline involvement. `version: 1` is included on every record so the loader can defensively filter out future-incompatible entries.

Validation lives in [src/ml/poseValidation.ts](../../src/ml/poseValidation.ts) and gates the capture button: 30 of 33 landmarks must have `visibility >= 0.5`, and the four normalization anchors (left/right shoulders 11/12, left/right hips 23/24) must each be visible. These thresholds mirror the offline pipeline's quality bar so a captured pose is comparable in quality to a curated one — without that, matching against a low-quality capture would silently produce noise.

**Frame-staleness gotcha.** [src/camera/usePoseLandmarkerOutput.ts](../../src/camera/usePoseLandmarkerOutput.ts) and the underlying `HybridPoseLandmarkerOutput.kt` drop frames silently when MediaPipe finds no person (the analyzer returns early without invoking the JS callback). That means `usePoseStream.latestFrame` retains the **last good frame indefinitely** after the user steps out of frame — every consumer that just reads `latestFrame` will see a "valid" pose forever. The CaptureButton works around this with a local 250 ms tick that compares `now - latestFrame.timestamp` against a 500 ms staleness threshold; stale frames are treated as "no pose" so the button greys out promptly. Anything else that needs a "person currently in frame" signal should do the same comparison rather than trust `latestFrame` alone.

UI: [src/ui/components/CaptureButton.tsx](../../src/ui/components/CaptureButton.tsx) (right-edge orange/grey 📌 button) and [src/ui/components/CaptureNameDialog.tsx](../../src/ui/components/CaptureNameDialog.tsx) (Modal with name + 3 categories — `lifestyle`/`group` excluded as too rare for capture — + 1–5 difficulty). [src/ui/components/PoseSelector.tsx](../../src/ui/components/PoseSelector.tsx) renders a "📌 My Poses" section between "✨ For You" and the rest of the library, with orange-tinted card borders to distinguish them from yellow recommendations and the default white border. Long-press on a captured card triggers an `Alert.alert` confirm-delete (delete-and-recapture is the only edit path; in-place editing is intentionally not supported for v1).

Files of interest:
- [src/types/customPose.ts](../../src/types/customPose.ts) — `CapturedPose` schema (v1).
- [src/state/customPoses.ts](../../src/state/customPoses.ts) — MMKV-backed Zustand store (id `custom-poses`, key `captures.v1`).
- [src/ml/poseValidation.ts](../../src/ml/poseValidation.ts) — `validateForCapture`, mirrors offline pipeline thresholds.
- [src/ml/poseValidation.test.ts](../../src/ml/poseValidation.test.ts) — 5 unit cases (null, 33-visible, 25-visible, anchor occlusion, etc.).
- [src/ui/components/CaptureButton.tsx](../../src/ui/components/CaptureButton.tsx) — staleness-aware capture trigger.
- [src/ui/components/CaptureNameDialog.tsx](../../src/ui/components/CaptureNameDialog.tsx) — name/category/difficulty modal.
- [src/ui/components/PoseSelector.tsx](../../src/ui/components/PoseSelector.tsx) — "📌 My Poses" section + long-press delete.

### G19. Settings / profile-edit pattern — slide-up modal, separate destructive actions, re-capture flow distinct from direct edits (2026-05-05)

Profile editing post-onboarding is a slide-up modal sheet hosted from CameraScreen rather than a navigated screen — the user stays one tap away from the camera and we avoid pulling in React Navigation just to expose a single screen. The gear ⚙️ button is mounted absolute top-right of the camera preview with `zIndex: 100` so it floats above the Skia overlay.

Three editable categories surface differently because they have different lifecycles:

- **Direct edits (gender, height)** — tap the new option and it persists immediately via the existing `setGender` / `setHeightBucket` store actions. No save button.
- **Face shape (re-capture only)** — face shape is derived geometrically from a photo, not user-typed, so the field is a non-interactive readonly box plus a "Re-capture face" button. Tapping it lifts state up to CameraScreen, which unmounts the back-camera preview and renders [FaceCaptureScreen](../../src/ui/screens/onboarding/FaceCaptureScreen.tsx) with `mode="recapture"` (same component used in onboarding, just with the "3 of 3" step label replaced and a Cancel button added). On either capture or cancel, return to the settings modal opened.
- **Destructive actions** — "Re-do onboarding" (`useUserProfile.reset`) and "Clear all my poses" (`useCustomPoses.reset`) are deliberately split. They reset different stores and represent different user intents; combining them would couple two unrelated decisions and force a user who only wants to clear poses to also re-do onboarding (or vice versa). Both are gated by a per-action `Alert.alert` confirm.

**Touch-priority gotcha.** The modal sheet uses a sibling `Pressable absoluteFill` backdrop, **not** a parent Pressable wrapping the sheet. The wrapping form competes with the inner `ScrollView` for touch responder priority — symptom on debug builds is sluggish "tap to open" and laggy scrolling inside the sheet. Sibling layout (backdrop Pressable rendered first, sheet rendered on top) preserves ScrollView's exclusive ownership of vertical-drag gestures.

Files of interest:
- [src/ui/components/SettingsButton.tsx](../../src/ui/components/SettingsButton.tsx) — gear ⚙️, 40 px circular, semi-transparent.
- [src/ui/screens/SettingsModal.tsx](../../src/ui/screens/SettingsModal.tsx) — modal sheet, four sections (gender / height / face shape / profile actions).
- [src/ui/screens/CameraScreen.tsx](../../src/ui/screens/CameraScreen.tsx) — owns `settingsOpen` and `recapturing` state; early-returns FaceCaptureScreen in recapture mode so the back-camera Camera unmounts cleanly.
- [src/ui/screens/onboarding/FaceCaptureScreen.tsx](../../src/ui/screens/onboarding/FaceCaptureScreen.tsx) — accepts optional `mode: 'onboarding' | 'recapture'` and `onCancel` props; OnboardingNavigator usage unchanged (defaults to onboarding).

### G20. Face-shape classifier threshold gaps + closest-match fallback (2026-05-05)

The geometric face-shape classifier in [src/ml/faceShape.ts](../../src/ml/faceShape.ts) applies five priority-ordered rules (diamond → heart → oval → round/square) against three ratios derived from MediaPipe Face Mesh landmarks: length-to-width, forehead-to-jaw, cheekbone-to-jaw. The rules' thresholds were tuned in isolation against synthetic fixtures and leave **gaps** — many real faces produce ratios that don't satisfy any rule (e.g. length-to-width = 1.15, just above the round/square ceiling at 1.1 but below the oval floor at 1.3). Those faces previously fell through to `'unknown'`, which the UI surfaces as "Not detected" — confusing because 468 valid landmarks ARE being detected.

To paper over the gaps without changing existing rule semantics, `deriveFaceShape` now ends in a `closestShape` fallback that returns whichever shape's thresholds the metrics violate the *least* (sum of clamped distances from each threshold), with `'oval'` as the tiebreaker (most common shape in the general population). All five existing synthetic test cases still hit their direct rules; one new test exercises the fallback.

`'unknown'` is still returned when landmarks are missing/degenerate (fewer than 468, or zero-width measurements that would NaN the ratios). It is no longer returned when a real face is in frame.

**TODO (Phase 4+):** recalibrate the geometric thresholds against a labeled face dataset to eliminate the fallback's load-bearing role. The fallback is a temporary safety net, not a calibrated classifier — its choices are mathematically defensible but not necessarily anatomically correct.

Files of interest:
- [src/ml/faceShape.ts](../../src/ml/faceShape.ts) — `deriveFaceShape`, `computeFaceShapeMetrics`, and the `closestShape` fallback.
- [src/ml/faceShape.test.ts](../../src/ml/faceShape.test.ts) — 6 synthetic cases (5 rule-direct, 1 fallback gap). Run with `npx tsx src/ml/faceShape.test.ts`.

### G21. Cloud-augmented scene reasoning — Phase 4-A backend modules (2026-05-05)

Phase 4-A introduces "Smart Suggestions": the user taps a button, the app captures the current camera frame and asks Gemini 2.5 Flash to recommend 3-5 poses from the local library tailored to scene + user profile. Phase 4-A this session = backend modules + offline harness; Phase 4-B = UI integration with a real camera ref.

**Architecture decision: direct Gemini API calls, no backend proxy (v1).** Personal-scope-only rule from the spec — the API key is embedded in the build via `.env` (gitignored, loaded via `expo-constants` or `react-native-dotenv` in 4-B). A backend proxy lands "just before public distribution," not now. This is acceptable because the v1 build is for the developer's personal use only; if the APK leaks the key leaks, but distribution is gated.

**Module layout** (all under [src/smartSuggestions/](../../src/smartSuggestions/)):
- [captureFrame.ts](../../src/smartSuggestions/captureFrame.ts) — Phase 4-A: signature + documentation only. Phase 4-B will install `expo-camera` (or `react-native-view-shot`) + `expo-image-manipulator`, wire the real camera ref, and resize/JPEG-encode the frame to fit within 768×768 at quality 80.
- [buildPrompt.ts](../../src/smartSuggestions/buildPrompt.ts) — `buildSystemPrompt()` (static role + JSON schema + constraints) and `buildUserMessage(request)` (per-call profile + library + shown list as JSON, plus the base64 image). Includes `projectPoseForAgent()` which slims `RichPose` down to the 11 fields the model needs (drops `referenceLandmarks`, `bodyTypeHints`, `groupSize`, `recommendedClothing`, `imageAttribution`) to keep token count manageable.
- [callGeminiAPI.ts](../../src/smartSuggestions/callGeminiAPI.ts) — `fetch` against `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`, AbortController timeout (default 10 s, override per call), error mapping (401/403 → `api-error invalid_key`, 429 → `rate-limit`, network → `no-internet`, abort → `timeout`). Errors thrown as `Error` instances with an `errorPayload` discriminated-union property — preserves stack traces while letting consumers pattern-match.
- [parseResponse.ts](../../src/smartSuggestions/parseResponse.ts) — unwraps the Gemini envelope (`candidates[0].content.parts[0].text`), `JSON.parse`s the inner text, validates required fields, **drops poseIds not in the library** (hallucination filter — logs dropped IDs to console.warn for debugging), trims `reasoning` to 200 chars, re-ranks if the model's ranks aren't contiguous starting from 1.
- [src/types/smartSuggestions.ts](../../src/types/smartSuggestions.ts) — `SmartSuggestionRequest`, `SmartSuggestionResult`, `SmartSuggestionError` discriminated union.
- [scripts/smartSuggestions-harness.mjs](../../scripts/smartSuggestions-harness.mjs) — Node CLI that runs the full pipeline against a test image; reads `GEMINI_API_KEY` from `.env` via a manual single-var parser (no dotenv dep). Run via `npm run phase4:harness <image-path>`.

**Empirical latency on first end-to-end run (2026-05-05).** With a 25 KB / 33 K-base64-char image (downscaled from a 1 MB original via sharp to mirror Phase 4-B's intended 768×768), against the 11-pose library, the Gemini 2.5 Flash response came back in **9.4 s** (1.8 KB body, 4 valid picks, scene description). Single data point, but **9.4 s sits a hair under the spec's 10 s production timeout** — variance would push real users into `timeout` errors regularly. The harness uses a 60 s diagnostic timeout to surface this without false-failing; production code keeps the spec's 10 s default. **Action item for Phase 4-B/C:** gather more samples and consider bumping production timeout to 15-20 s, or add retry-on-timeout, or shrink the prompt (the library JSON is the dominant token contributor).

**Hallucination filter is load-bearing.** The prompt explicitly forbids invented IDs, but Gemini still occasionally emits IDs not present in the library — the parser silently drops these and re-ranks the survivors. Log lines like `[smartSuggestions] dropped N hallucinated pose id(s): ...` appear in dev logs when this fires. If the drop rate becomes a problem in 4-C testing, options are: (a) fewer-shot examples in the system prompt, (b) constrained decoding via Gemini's tool-use mode, (c) post-hoc retry with stricter wording. We do not address this in 4-A — the filter is a backstop, not a fix.

**Two ESM-resolution gotchas surfaced while wiring the harness.**

1. **Bare-extension imports break Node ESM strip-types.** Existing `src/library/poseLibrary.ts` imported `from '../ml/normalize'` (no extension) — fine for Metro and `tsc --noEmit` thanks to `allowImportingTsExtensions`, but Node's ESM resolver in `--experimental-strip-types` mode (default since Node 23.6) requires the explicit `.ts`. Fix: change the value import to `from '../ml/normalize.ts'`. Type-only imports continue to work bare — the existing convention. Pattern matches the existing [scripts/process-poses.mjs](../../scripts/process-poses.mjs).

2. **JSON imports in Node ESM need the `with { type: 'json' }` import attribute.** `poseLibrary.ts`'s `import generatedPosesJson from './data/poses.generated.json'` worked under Metro/tsc but failed under Node ESM with `ERR_IMPORT_ATTRIBUTE_MISSING`. Fix: `import generatedPosesJson from './data/poses.generated.json' with { type: 'json' }` — standard ES2025 syntax, supported by TypeScript 5.3+ and Metro's babel transform.

**Tests** (8 + 9 = 17 cases):
- [src/smartSuggestions/__tests__/buildPrompt.test.ts](../../src/smartSuggestions/__tests__/buildPrompt.test.ts) — system prompt structure, projection drops the right fields, user message embeds gender + shownPoseIds, payload is JSON-parseable. `node --experimental-strip-types --test` ✓.
- [src/smartSuggestions/__tests__/parseResponse.test.ts](../../src/smartSuggestions/__tests__/parseResponse.test.ts) — valid response, hallucinated-id drop, all-hallucinated → `no-valid-picks`, malformed JSON → `parse-error`, missing recommendations → `parse-error`, reasoning trimmed at 200 chars, non-contiguous ranks re-ranked, empty array → `no-valid-picks`, malformed envelope → `parse-error`. ✓.

**Out of scope tonight (deferred to subsequent 4-x):**
- Phase 4-B: SmartSuggestionsButton UI, real camera-ref wiring, `expo-camera` + `expo-image-manipulator` install, env-loading via `expo-constants`/`react-native-dotenv` (decision deferred to 4-B alongside the actual usage).
- Phase 4-C: result caching (avoid re-calling Gemini for identical scene + profile).
- Phase 4-D: rate limiting (per-user per-day budget).
- Phase 4-F: device APK build + install.
- Consent flow — explicitly deferred per spec's personal-scope rule.

### G22. Phase 4-B Smart Suggestions UI integration (2026-05-05)

Phase 4-B wires the Phase 4-A backend modules (G21) into the camera screen as a visible feature: a "Smart Picks" button on `CameraScreen`, a fresh "🎯 AI Picks" section at the head of `PoseSelector`, and full lifecycle state (idle / loading / result / error). 8/8 on-device verifications green on Galaxy device this session.

**Button placement and state.** [`SmartSuggestionsButton`](../../src/ui/components/SmartSuggestionsButton.tsx) sits bottom-left, mirroring the orange `CaptureButton` on the right (72 px circle, `top: '50%'`, `marginTop: -36`). Purple fill (#7C3AED) with a #9333EA border; loading swaps the 🎯 emoji for an `ActivityIndicator`; disabled greys out when no `photoOutput`, when a request is in flight, or when onboarding is incomplete. Lifecycle state lives in [`src/state/smartSuggestionsState.ts`](../../src/state/smartSuggestionsState.ts) — a zustand store with `loading`, `result`, `error` and four actions (`startRequest`, `setResult`, `setError`, `clear`). Intentionally NOT persisted: matches Phase 3B's session-novelty model (a fresh launch deserves a fresh suggestion run, not a stale cached pick).

**Frame capture: photoOutput + Skia (deviates from spec's takePhoto + image-resizer).** Phase 4-A's `captureFrame.ts` was a stub; the spec called for `cameraRef.takePhoto()` + `react-native-image-resizer`. Vision-camera 5.x removed the imperative ref API in favour of declarative outputs, so we wired a `usePhotoOutput({ targetResolution: 1280×720, qualityPrioritization: 'speed' })` on `CameraScreen` alongside the existing pose output and pass the handle into the button. Skia (already a dep for the pose overlay) handles decode + resize + JPEG re-encode to base64 in three calls — `MakeImageFromEncoded` → offscreen `Surface.MakeOffscreen(targetW, targetH)` + `drawImageRect` for the scale → `encodeToBase64(JPEG, 80)`. **Net effect: zero new native dependencies, no prebuild change.** Also explicit `photo.dispose()` in a `finally` to release the in-memory Photo before Skia decodes the bytes (per the vision-camera docs' warning about JS runtime leaks).

**API timeout doubled from 10 s → 20 s + prompt slimmed.** G21 flagged 9.4 s observed Gemini latency vs the spec's 10 s timeout = 0.6 s margin = intermittent prod timeouts. Tonight's harness re-run on the new build measured 13.5 s — confirming the original margin would have failed regularly. [`callGeminiAPI.ts`](../../src/smartSuggestions/callGeminiAPI.ts) now defaults `TIMEOUT_MS = 20_000`. Separately, `description` was dropped from `PoseMetadataForAgent` (type, projection, system-prompt schema list) — name + tags + category cover pose semantics for the model and the verbose description was the dominant token contributor with the largest churn potential as the library grows. Dev-only `console.log` of prompt size (chars / ~tokens) added inside `buildUserMessage` as a tripwire for future library expansion.

**AI Picks section in PoseSelector.** Render order changed: clear → AI Picks (new) → For You → My Poses → tail library. Cards use `borderColor: #9333EA, borderWidth: 2px` over `rgba(147, 51, 234, 0.16)` background; same category-glyph treatment as library cards; same `selectTarget + markShown` on tap (so AI picks participate in the session-novelty machinery from Phase 3B). Long-press shows the agent's reasoning in an `Alert.alert` titled with the pose name — discoverable detail without crowding the strip. Loading inlines a single card with a violet `ActivityIndicator` and "Analyzing scene…". Error inlines a red ⚠️ card whose label is mapped per `SmartSuggestionError.type` (no-internet → "Connect to internet for Smart Picks"; rate-limit → "Rate limit reached, try again in a minute"; timeout → "Took too long, tap Smart Picks to retry"; api-error → "Couldn't reach the service, tap to retry"; parse-error / no-valid-picks → "Couldn't generate picks, tap to retry") and tap-to-clear (returns to idle so the user can re-tap the Smart Picks button).

**Picks dedupe across sections.** AI-recommended pose IDs are removed from the Phase 3B "For You" list and from the library tail before render — otherwise a hot pose ("hands-hips") could appear three times. The dedupe is applied in `useMemo` keyed on `aiPickIds`, so updates re-flow only when picks change.

**API key embedding.** App reads `process.env.EXPO_PUBLIC_GEMINI_API_KEY`. Added that line to `.env` alongside the existing `GEMINI_API_KEY` so both the bundle (Metro injects `EXPO_PUBLIC_*`) and the harness (its own parser) keep working without coordinating naming. Personal-scope-only rule from the spec still applies — backend proxy is a future phase.

**Build / install / Metro environment notes.**
- **Memory pressure**: first two gradle invocations crashed with JVM `OutOfMemoryError` / "paging file is too small" at the Kotlin daemon spawn. Host had 0.4–0.7 GB free virtual memory at the time. After freeing RAM (back to ~11 GB free virtual), `assembleDebug` finished cleanly in 9 m 28 s.
- **Port collision on 8081**: VS Code's redhat.java extension was bound to `127.0.0.1:8081`. Metro's IPv6-only bind on `::8081` then served IPv6 fine but `adb reverse tcp:8081 tcp:8081` (IPv4-targeted) hit redhat.java instead and produced "connection refused / Retry" in expo-dev-launcher. Fix: run Metro on `--port 8082` and `adb reverse tcp:8082 tcp:8082`, then deep-link the dev-launcher via `am start -a android.intent.action.VIEW -d "exp+aiposesuggestor://expo-development-client/?url=http://127.0.0.1:8082"`.

**On-device verification (8/8 PASS).** Smart Picks button visible with 🎯 emoji bottom-left, mirroring the orange Capture button. Tap → "Analyzing scene…" spinner ~5–15 s. Result renders 3–5 purple-bordered AI Picks distinct from yellow For You cards. Long-press shows the reasoning alert. Tap selects the pose, ghost target + fit % work like a regular library pose. Disabling internet + tap surfaces "Connect to internet for Smart Picks" with ⚠️. Re-enabling internet + retap recovers cleanly.

Files of interest:
- [src/ui/components/SmartSuggestionsButton.tsx](../../src/ui/components/SmartSuggestionsButton.tsx) — button + tap handler.
- [src/ui/components/PoseSelector.tsx](../../src/ui/components/PoseSelector.tsx) — AI Picks section + error/loading mapping + dedupe.
- [src/state/smartSuggestionsState.ts](../../src/state/smartSuggestionsState.ts) — zustand store, not persisted.
- [src/smartSuggestions/captureFrame.ts](../../src/smartSuggestions/captureFrame.ts) — `photoOutput.capturePhoto` → Skia resize → base64.
- [src/ui/screens/CameraScreen.tsx](../../src/ui/screens/CameraScreen.tsx) — `usePhotoOutput` wired into the Camera's outputs, `SmartSuggestionsButton` mounted as a `CaptureButton` sibling.

**Out of scope, deferred to subsequent 4-x:**
- Phase 4-C: result caching (avoid duplicate Gemini calls for the same scene + profile).
- Phase 4-D: rate limiting (per-user per-day budget).
- Backend proxy + consent flow — public-distribution prerequisites, not for this scope.
- Recapture latency reduction (the 13–14 s wait is dominated by Gemini server time; investigate prompt shrinkage further or move to streaming).

### G23. Phase 4-C Smart Suggestions caching — pHash + bounded LRU (2026-05-06)

Phase 4-C eliminates redundant Gemini calls when the user taps Smart Picks repeatedly without moving the camera. Average uncached latency is 10–15 s (G22); average cached latency is now ~30–60 ms (pHash compute dominates). Cache is in-memory only — survives screen rotation but not app restart, intentional.

**Perceptual hash (pHash), pure TS.** [`src/smartSuggestions/pHash.ts`](../../src/smartSuggestions/pHash.ts) implements the standard pHash algorithm: 32-point 2D DCT-II on a 32x32 grayscale buffer, then take the top-left 8x8 low-frequency block, threshold each cell against the median of the other 63 cells (DC excluded so brightness shifts don't flip every bit), pack 64 bits MSB-first into 8 bytes → 16-char hex. The 32-point cosine basis is precomputed once at module load (1024 floats). Zero native deps — adding a C++ DCT or pulling in a hash library would have required a prebuild and growing the binary; the JS DCT is comfortably under 50 ms on the Samsung A22 5G. Hamming distance via popcount table over hex byte pairs.

**Cache: bounded LRU + Hamming-distance lookup + lazy TTL.** [`src/smartSuggestions/cache.ts`](../../src/smartSuggestions/cache.ts) holds entries in an insertion-ordered `Map<string, CacheEntry>`. On lookup, scan all live entries (≤ 20 by default), compute Hamming distance to the query hash, return the closest entry within `matchDistance` (default 8) and within `ttlMs` (default 5 min). On hit, the entry is re-inserted to move it to the MRU end so it survives subsequent eviction. On store at capacity, the LRU (first key) is dropped. TTL is enforced lazily at lookup time — no background sweeper. The exported singleton `smartSuggestionsCache` is what the UI uses; tests construct their own with an injectable `now()` to drive TTL deterministically.

**Why the threshold = 8 Hamming distance.** A 64-bit pHash with d ≤ 8 means ≥ 87.5% of low-frequency DCT bits agree. Two captures of the same scene with normal camera-sensor noise / autoexposure jitter / autofocus drift land in this range; a meaningful scene change (different room, different background, different lighting) blows past it. On-device verification this session: (a) two consecutive taps without moving = HIT, (b) physically walking to a different scene = MISS with fresh API call returning different picks. If real-world false misses turn up over time, loosen toward 12; if false hits, tighten toward 4.

**Frame capture exposes both base64 and grayscale.** Rather than decode the JPEG twice, [`captureCurrentFrame`](../../src/smartSuggestions/captureFrame.ts) now returns `{ base64, grayscale }`. The same Skia source image is rendered to two surfaces: the existing 768×768 surface (→ JPEG → base64 for Gemini) and a new 32×32 surface (→ readPixels RGBA → JS luminance via Rec. 601 in [`imageToGrayscale.ts`](../../src/smartSuggestions/imageToGrayscale.ts) → 1024-byte grayscale). Skia's native scale + JS luminance is fast enough that a second JPEG round-trip would be pure waste.

**SmartSuggestionsButton flow.** Capture → pHash → `cache.lookup(hash)` → on hit: `setResult({...cached, fromCache: true})`, return. On miss: existing build/call/parse path, then `cache.store(hash, fresh)` and `setResult({...fresh, fromCache: false})`. The `fromCache` field already existed on `SmartSuggestionResult` from G21 — Phase 4-C just started populating it.

**UI indicator.** [`PoseSelector.tsx`](../../src/ui/components/PoseSelector.tsx) renders a small `(cached)` hint after `🎯 AI Picks` when `smartResult.fromCache === true`. Color is the AI Picks accent at 55% alpha, fontSize 10 vs the label's 12 — visible if you look, invisible if you don't. The intent is dev-style transparency, not a feature highlight; first-time users won't read it as anything.

**Dev tripwire logging.** Both `cache.lookup` and `cache.store` log a one-line summary in `__DEV__` builds (hash, nearest-distance, threshold, HIT/MISS / size). This was added during sub-step E when the user reported "I don't think it's caching that much" — the log surfaces actual on-device Hamming distances so the threshold can be re-tuned with data, not guesses. Same pattern as G22's prompt-size tripwire in `buildUserMessage`.

**Tests.** 10 pHash tests (deterministic, format, throws on bad length, near-identical → small distance, distinct patterns → large distance, hammingDistance edge cases) + 10 cache tests (empty, exact, fuzzy hit, fuzzy miss, TTL expiry, eviction, MRU promotion, closest-match, clear, refresh on re-store). Tests pass injectable `now()` for TTL control and pin `matchDistance: 0` on eviction tests so unrelated hashes don't collide via fuzzy lookup. All 35 smartSuggestions tests green.

**Gemini API key swap mid-session.** During verification the dev key hit a daily limit. Swapping the key in `.env` requires a Metro restart with `--clear` so the new value re-injects into the bundle (`process.env.EXPO_PUBLIC_GEMINI_API_KEY` is baked at bundle time, not read at runtime). After restart + adb reverse + dev-client deep-link, the new key worked. This is environmental, not a code defect — but worth noting because the same trip-up will recur whenever the key rotates.

**On-device verification (4/4 PASS).** First tap on a fresh scene: 5–15 s spinner, fresh API call, no `(cached)` hint. Second tap without moving the camera: < 1 s, `(cached)` hint visible. Third tap after physically moving to a different scene: spinner returns, fresh picks, no `(cached)` hint.

Files of interest:
- [src/smartSuggestions/pHash.ts](../../src/smartSuggestions/pHash.ts) — DCT + hex hash + Hamming distance.
- [src/smartSuggestions/cache.ts](../../src/smartSuggestions/cache.ts) — LRU + TTL + fuzzy lookup + singleton export.
- [src/smartSuggestions/imageToGrayscale.ts](../../src/smartSuggestions/imageToGrayscale.ts) — RGBA → grayscale via Rec. 601 luma.
- [src/smartSuggestions/captureFrame.ts](../../src/smartSuggestions/captureFrame.ts) — now returns `{ base64, grayscale }`.
- [src/ui/components/SmartSuggestionsButton.tsx](../../src/ui/components/SmartSuggestionsButton.tsx) — capture → hash → lookup → API → store flow.
- [src/ui/components/PoseSelector.tsx](../../src/ui/components/PoseSelector.tsx) — `(cached)` label.

**Out of scope, still deferred to 4-D / 4-F:**
- Per-user per-day rate limiting (Phase 4-D).
- Persistent cache across app restarts (intentionally not done — matches Phase 3B novelty pattern).
- Backend proxy + consent flow.
- Pre-tuning the threshold against a corpus — for now, observe with the dev log and tune empirically if needed.

### G24. Phase 4-D Smart Suggestions rate limiting — per-device daily cap (2026-05-06)

Phase 4-D adds a hard ceiling of 50 Gemini calls per device per day, persisted to MMKV, resetting at local midnight. Purpose: protect the personal-scope dev-key quota from accidental burn during active testing, and establish the structural place where a backend rate limit will plug in once the proxy ships. This is NOT a substitute for server-side limits — anyone willing to clear app data resets their counter.

**Storage shape.** Dedicated MMKV id `smart-suggestions-usage` (separate from `user-profile` and `custom-poses` so the lifecycle is independent — clearing usage shouldn't risk profile state). Two keys:
- `usage.count.v1` (number) — today's running count.
- `usage.resetDate.v1` (string) — last day a counter was active, formatted `YYYY-MM-DD` in **device local time** (not UTC). Local-time reset matches the user's mental model of "a new day"; UTC would reset mid-evening for non-Z timezones.

**Lazy reset, no timer.** [`SmartSuggestionsRateLimiter.consume()`](../../src/smartSuggestions/rateLimiter.ts) and `.status()` both compare today's local date string against the stored one. If different, the counter is treated as 0 for the new day. No background timer, no scheduled job, no `setInterval`. The user opens the app at 09:00 the next day → first call observes the date mismatch → fresh quota.

**consume() runs after cache miss, NOT on every tap.** In [`SmartSuggestionsButton.handlePress`](../../src/ui/components/SmartSuggestionsButton.tsx) the order is now: `status()` pre-check → capture → pHash → cache lookup → on hit, return without consuming → on miss, `consume()` → `callGeminiAPI`. Cache hits are free. This matches the spec's intent: the rate limit is on real outbound calls, not user button presses.

**Race window is acceptable.** Two near-simultaneous taps after a cache miss could theoretically bump the count slightly past cap, but `consume()` is synchronous + MMKV-backed and the existing `loading` flag in [`smartSuggestionsState.ts`](../../src/state/smartSuggestionsState.ts) gates the button while a request is in flight. Worst case: cap is hit at 51 instead of 50 once. Worth nothing — adding a true atomic compare-and-set via Nitro would be effort for a 2% slop.

**Injectable storage + clock.** The class accepts `{ storage, now }` in config so tests don't depend on MMKV native code. Production uses a thin `RateLimiterStorage` adapter wrapping `react-native-mmkv` via lazy `require()` inside `defaultStorage()` — top-level `import` of `react-native-mmkv` would crash Node at module-load time because the package's index.js fans out to `.android.js` / `.ios.js` resolvers that Node can't pick. Lazy require keeps unit tests in pure Node without resorting to a setup file or jest mocks. Same pattern is reasonable for any future MMKV-backed module that needs unit-testability.

**Singleton is a function, not a value.** Exported as `smartSuggestionsRateLimiter()` (a memoised getter), not `smartSuggestionsRateLimiter` (a constructed object). Reason: constructing eagerly at module load runs `defaultStorage()` → `require('react-native-mmkv')` → native binding lookup, even when the module is just being imported by the test runner. Calling it as a function defers that to runtime. Callers in production code change from `smartSuggestionsCache.lookup(...)`-style direct access to `smartSuggestionsRateLimiter().status()` — minor ergonomic cost, big testability win.

**Error type extension.** `SmartSuggestionError` rate-limit variant gains an optional `resetAt?: string` (ISO timestamp). Existing callers (Gemini's own 429 → `{ type: 'rate-limit' }` from `callGeminiAPI`) don't carry this field; only the local-quota check sets it. [`PoseSelector.errorMessageFor`](../../src/ui/components/PoseSelector.tsx) renders the local case as `Daily limit reached — resets at 12:00 AM` (locale-formatted) and falls back to the existing "Rate limit reached, try again in a minute" for the remote case. Tap-to-clear on the error card works the same as for any other error.

**Tests (10 new, 45 total in smartSuggestions).** Tests cover: fresh state, single consume, full-day fill, refusal at cap, midnight crossover with running counter, cap-hit + crossover + new-day allow, custom dailyCap, resetAt = upcoming local midnight, manual reset, and two limiter instances sharing storage. Tests use a Map-backed `RateLimiterStorage` fake and inject `now: () => Date` for clock control. Zero real-time `setTimeout`.

**Optional polish skipped.** Spec called for an optional "(8 left today)" badge on the Smart Picks button when `remaining < 10`. Not implemented — the spec marks it skip-if-running-long, and the existing error UI surfaces the limit clearly enough on cap-hit. Easy to add later: read `smartSuggestionsRateLimiter().status().remaining` in the button's render path.

**On-device verification.** Two normal Smart Picks calls (one fresh API call, one move-and-tap fresh call) confirmed the rate limiter integration didn't break the existing flow. Cap-hit behavior is verified by the unit tests, not on device — testing 50 consumes on a real device would burn quota and a "lower the cap temporarily for testing" pattern is exactly the kind of hardcode that ships to production by accident.

Files of interest:
- [src/smartSuggestions/rateLimiter.ts](../../src/smartSuggestions/rateLimiter.ts) — class, injectable storage/clock, lazy MMKV require, function-style singleton.
- [src/smartSuggestions/__tests__/rateLimiter.test.ts](../../src/smartSuggestions/__tests__/rateLimiter.test.ts) — 10 unit tests with Map-backed fake storage.
- [src/ui/components/SmartSuggestionsButton.tsx](../../src/ui/components/SmartSuggestionsButton.tsx) — pre-check + post-cache-miss `consume()`.
- [src/types/smartSuggestions.ts](../../src/types/smartSuggestions.ts) — optional `resetAt` on the rate-limit error variant.
- [src/ui/components/PoseSelector.tsx](../../src/ui/components/PoseSelector.tsx) — formatted reset-time message.

**Out of scope, still deferred to 4-F:**
- Server-side rate limiting (waits on backend proxy).
- Subscription tiers (Phase 5+).
- Per-API-error rate-limit branching — Gemini's 429s already flow through the existing `SmartSuggestionError` path.
- "(N left today)" button badge — optional polish, deferrable.

### G25. Phase 4 (cloud-augmented scene reasoning) consolidated architectural review (2026-05-06)

Phase 4 added an optional cloud path for pose recommendations that runs in parallel with the on-device personalization engine from Phase 3B. The user explicitly opts in by tapping a "Smart Picks" button; on-device recommendations remain the default for users who never opt in. This entry consolidates G21–G24 into one architectural picture, plus the integration-test layer and orchestration extraction added in 4-E.

**Module structure ([src/smartSuggestions/](../../src/smartSuggestions/)):**
- types: [src/types/smartSuggestions.ts](../../src/types/smartSuggestions.ts) — `SmartSuggestionRequest` / `Result` / `Pick` / `Error` / `PoseMetadataForAgent`.
- [captureFrame.ts](../../src/smartSuggestions/captureFrame.ts) — vision-camera `takePhoto` + Skia decode → 768×768 base64 JPEG **and** 32×32 grayscale Uint8Array, single decode, two surfaces.
- [buildPrompt.ts](../../src/smartSuggestions/buildPrompt.ts) — system prompt + library projection (`projectPoseForAgent` drops `description`, `referenceLandmarks`, `bodyTypeHints`, `groupSize`, `recommendedClothing`, `imageAttribution` for token efficiency).
- [callGeminiAPI.ts](../../src/smartSuggestions/callGeminiAPI.ts) — HTTPS to Gemini 2.5 Flash, 20 s timeout, error mapping for 401/403 → `api-error invalid_key`, 429 → `rate-limit`, network → `no-internet`, abort → `timeout`.
- [parseResponse.ts](../../src/smartSuggestions/parseResponse.ts) — envelope unwrap → JSON parse → hallucinated-ID filter against `libraryIds` → reasoning trim @200 chars → contiguous re-rank.
- [pHash.ts](../../src/smartSuggestions/pHash.ts) — 32×32 grayscale → 2D DCT-II → 8×8 low-frequency window (DC excluded from threshold) → median threshold → 64-bit hex hash. Pure TS, no native deps.
- [cache.ts](../../src/smartSuggestions/cache.ts) — Map-backed bounded LRU (20 entries) with Hamming-distance lookup (threshold 8) and lazy TTL check (5 min). In-memory only by design — matches Phase 3B novelty pattern.
- [rateLimiter.ts](../../src/smartSuggestions/rateLimiter.ts) — MMKV-backed daily counter at id `smart-suggestions-usage`, local-midnight reset, lazy `require` of `react-native-mmkv` to allow Node tests, function-style singleton (`smartSuggestionsRateLimiter()`) so module-load doesn't touch native bindings.
- [imageToGrayscale.ts](../../src/smartSuggestions/imageToGrayscale.ts) — RGBA → Rec. 601 luma fallback path.
- [orchestrate.ts](../../src/smartSuggestions/orchestrate.ts) — extracted in 4-E; pure function `runSmartSuggestionsFlow(input, deps)` that runs cache lookup → rate-limit gate → API call → parse → cache store. Production and integration tests share this exact code path.
- [index.ts](../../src/smartSuggestions/index.ts) — barrel re-exporting the public surface so consumers outside the folder import from one path. Added in 4-E.

**State: [src/state/smartSuggestionsState.ts](../../src/state/smartSuggestionsState.ts)** — Zustand store, in-memory, not persisted (matches the Phase 3B novelty-tracking pattern: cache state is session-scoped, daily quota is the only thing that survives restart).

**UI:**
- [src/ui/components/SmartSuggestionsButton.tsx](../../src/ui/components/SmartSuggestionsButton.tsx) — bottom-left, 72 px, purple `#7C3AED` / `#9333EA` gradient, 🎯 icon. Disabled when no `photoOutput`, no profile, or a request is in flight. After 4-E refactor, the body delegates orchestration to `runSmartSuggestionsFlow`; the button only handles state-store reads, frame capture, and UI dispatch on success/error.
- [src/ui/components/PoseSelector.tsx](../../src/ui/components/PoseSelector.tsx) — adds an "AI Picks" section above the user's regular picks: purple-bordered cards, long-press shows the model's reasoning in an alert, "(cached)" indicator on `fromCache=true`, locale-formatted reset-time on rate-limit error.

**Orchestration order (canonical, in [orchestrate.ts](../../src/smartSuggestions/orchestrate.ts)):**
1. `captureCurrentFrame(photoOutput)` (in the button — needs the live photo output, kept in UI layer).
2. `computePHash(grayscale)` (or test override).
3. `cache.lookup(hash)` — on hit, return `{...cached, fromCache: true}`. No quota touched.
4. `rateLimiter.status()` — on `allowed: false`, throw `rate-limit` with `resetAt`.
5. `rateLimiter.consume()` — on `false` (lost a race), throw `rate-limit` with the freshly-read `resetAt`.
6. `callGemini(request)` — raw response body string.
7. `parseResponse(rawText, libraryIds)` — validated `SmartSuggestionResult`.
8. `cache.store(hash, fresh)` — record for subsequent identical-scene taps.
9. Return `{...parsed, fromCache: false}`.

**Quota model.** Cache hits do not count against the daily 50-call cap. Rationale: if the user taps repeatedly without moving the camera, they've already paid the API cost once; subsequent taps in the same scene return the same result instantly. A scene change (Hamming distance > 8) is a real new request and consumes a slot. This is enforced structurally — `consume()` is only reachable on the cache-miss path.

**Why orchestrate was extracted in 4-E.** Before 4-E the cache→rate-limit→API→parse→store sequence lived in [`SmartSuggestionsButton.handlePress`](../../src/ui/components/SmartSuggestionsButton.tsx). Per-module unit tests covered each piece in isolation, but no test exercised the *interaction* between cache and rate limiter, or between parser and cache (specifically: does the cache store the *filtered* result after hallucination removal?). Pulling the logic into a pure function with injectable deps means the integration tests cover the same code that production runs — not a parallel re-implementation that could drift. The pre-cache-miss `status()` pre-check the button used to do is gone; the button now relies on orchestrate's own `status()` gate after the cache lookup, which matches the spec ordering and saves one redundant storage read on cache hits.

**Test coverage (8 suites, 53 tests).**
- pHash: 10
- cache: 10
- rate limiter: 10
- parseResponse: 9
- buildPrompt: 6
- integration: 8 (full happy path round-trip; cache hit avoids API; cache miss + allowed quota → API + counter increments; cache hit does not consume quota; cap blocks API + returns `rate-limit`; hallucinated IDs filtered before cache store; `fromCache` flag correct on both paths; eviction occurs while limiter still tracks every call).

**Distribution constraints (still binding, must clear before any non-personal release).**
1. API key embedded in build via `.env` / `expo-constants` — works for personal scope only.
2. No backend proxy yet — required before any non-personal distribution per security review.
3. No DPDP consent flow — required before any non-personal distribution per legal review.
4. Daily 50-call cap is enforced client-side; would also need server-side enforcement before public release.

**Open follow-ups.**
- Phase 4-F: extended on-device verification across varied real-world scenes.
- v2 backend proxy migration (Cloudflare Workers or Vercel Functions).
- DPDP consent flow + privacy-policy page.
- Subscription tiers (Phase 5+).
- Latency reduction beyond prompt slimming (response streaming, smaller library projections).
- Library growth past 11 poses — quality of cloud reasoning scales with library variety; once the library has 30+ poses, revisit prompt size and the slim projection's field set.
- "(N left today)" button badge — optional polish from G24, deferrable.

G26: Phase 4 personal-scope closed. Smart Picks field-tested on device, working as designed. Library size (11 poses) is the next bottleneck for recommendation differentiation, not a Phase 4 defect. Distribution constraints from G25 remain binding.

### G27. Body outline rendering replaces skeleton lines for live tracking + ghost target (2026-05-08)

Pose visualization in the camera screen previously rendered the 33 MediaPipe landmarks as a stick-figure skeleton (`POSE_CONNECTIONS` lines + per-joint dots) in two places: `PoseSkeleton` for live tracking and `PoseTargetOverlay` for the selected target ghost. Field-testing made it clear the skeleton form factor reads as a debug overlay rather than a body, and aligning a stick-figure inside another stick-figure ghost is harder than aligning a body inside a body.

The change here is purely a rendering swap. No new ML, no segmentation mask, no new dependency, no change to the 33-landmark data contract. Every downstream system that consumes landmarks — match scoring (G16), library entries (G18), recommendation engine (G17), Smart Suggestions (G21–G25) — works without modification.

**Implementation** (`src/ui/overlays/bodyOutlineGeometry.ts` + `bodyOutline.ts`).

The silhouette is built from the landmarks geometrically:
- **Torso**: closed quadrilateral through shoulders (11, 12) and hips (24, 23).
- **Limbs**: tapered tube polygon through three points (root → mid → tip) with thicknesses scaled to the user's shoulder width — arms taper 0.18 → 0.13 → 0.10 of shoulder width; legs taper 0.22 → 0.16 → 0.12. At the middle joint, the perpendicular is the average of the two segment perpendiculars so the bend stays continuous.
- **Head**: ellipse anchored above the nose. Width derived from ear-to-ear distance when both ears are visible (with a relaxed visibility threshold since ears are commonly occluded), otherwise a shoulder-width fallback.
- **Hands / feet**: small filled circles at wrists and ankles.

Skia handles overlapping fills cleanly when they share the same color, so the body parts merge visually at joints without a path-boolean union step. The pure geometry layer (`bodyOutlineGeometry.ts`) returns plain `Vec2`/ellipse/circle descriptors and is unit-tested directly via `node --test`; the Skia adapter (`bodyOutline.ts`) maps those descriptors to `SkPath`. The split keeps tests off Skia's native module.

**Visibility tolerance.** The geometry function returns `valid: false` if any of the four torso anchors (shoulders + hips) is below 0.5 visibility — the silhouette wouldn't be coherent. If only a limb's middle joint is occluded, the limb is rendered as a single tapered tube straight from root to tip. If both mid and tip are missing, the limb is omitted. The head is omitted when the nose is unreliable.

**Live vs ghost rendering** (`PoseSkeleton.tsx`, `PoseTargetOverlay.tsx`).
- Live: filled `#22C55E` at α 0.4, edge stroked at α 0.9 width 2. Falls back to the original skeleton-line renderer when `valid: false` so the user always sees their pose tracked.
- Ghost: filled `#FFFFFF` at α 0.25, edge stroked at α 0.7 width 2.5. When `valid: false` the ghost is omitted entirely rather than falling back — a wrong "you should be here" reference is worse than no reference (library entries pass validation upstream so this path is defensive).

The alpha gap (0.4 vs 0.25) plus the stroke-width difference is enough to keep the two silhouettes visually distinct without animation or a size offset.

**Z-order swap in `CameraScreen.tsx`.** Previously the ghost was drawn first (bottom) and the live skeleton on top. With silhouettes that ordering hides the ghost behind the live body. Reversed so the live silhouette draws first and the ghost overlays on top — the user sees their green body inside the white ghost stencil and aligns into it.

**What was deferred.** Real per-pixel body segmentation (MediaPipe Selfie Segmentation, Pose Landmarker Heavy mask) was considered and rejected for now: it's a 1–2 week ML refactor, adds a model download + native dependency, and the geometric approximation is sufficient for the alignment UX. Anatomical refinements (clothing, hair, gendered proportions) and outline-to-outline animation transitions are also out of scope. If user feedback shows the geometric silhouette is unrecognizable in real-world scenes, revisit with Selfie Segmentation as Path B.


### G28. SVG outline assets are the canonical user-facing pose guide; geometric silhouette (G27) demoted to dev-only fallback (2026-05-08)

Pose manifest gains an `outlineSvg` field. In production builds every pose MUST have a non-empty `outlineSvg` — `getOutlineAssetForPose()` throws if missing. In dev/internal builds a missing SVG falls back to the geometric silhouette renderer from G27 with a console.warn so the asset gap is visible during development. The visible target ghost is therefore a clean white **dotted** contour SVG (`stroke="#FFFFFF"`, `fill="none"`, `stroke-dasharray="8 12"`, rounded caps/joins, viewBox 1000×1000), rendered statically centered in the camera preview at this stage. SVGs are produced offline by `scripts/generate-pose-outline.mjs` (MediaPipe selfie segmentation via headless Chromium → binary mask → potrace → largest-subpath extraction → normalized SVG); the largest-subpath step ensures one clean outermost contour with no inner shapes. Live skeleton/keypoint data remains the matching contract; rendering of live silhouette and the white→green match-color transition are deferred to Prompt C. **Dynamic body-bbox-driven positioning of the outline is deferred — depends on resolving the camera frame rotation issue documented in G32.**

**Renderer split.** `PoseTargetOverlay` no longer lives inside the main Skia `<Canvas>`. The SVG path uses `react-native-svg` (`PoseOutlineSvg.tsx`), which can't render as a Skia child; the dev fallback remains Skia. So the overlay is now a sibling of the live-tracking Canvas in `CameraScreen.tsx` and wraps either branch in its own absolute-fill subtree (the fallback nests its own Canvas). Z-order is preserved by mount order: live silhouette Canvas → ghost (SVG or fallback Canvas).

**Asset bundling.** SVG files live under `assets/poseOutlines/<pose-id>_outline.svg`. `.svg` is in Metro's default `assetExts` for Expo SDK 54, so `require('./foo.svg')` returns an asset module ID with no transformer needed. `src/ui/overlays/poseOutlineAssetMap.ts` is the literal-string `require()` map; the renderer resolves to a URI via `Image.resolveAssetSource()`, fetches the SVG XML, parses the `<path>` attributes (including `stroke-dasharray`, `stroke-width`, `stroke-linecap`/`linejoin`), and re-renders them on a fresh `<Svg><Path>` tree so the source SVG's baked-in style drives appearance and only `color`/`opacity` overrides are runtime-controllable.

### G29. Build environment: RAM recovery before assembleDebug (2026-05-08)

On this Windows dev box (14 GB total), JVM OOM during Kotlin compile is recurring when other apps hold significant memory. Recovery before any `./gradlew assembleDebug`: close Chrome (largest single consumer), briefly close VS Code (Java/Kotlin language servers hold 400–500 MB each), run `./gradlew --stop`, kill any Java processes with WS > 100 MB. Confirm ≥ 3 GB free physical memory before building. ONNX-runtime-node has the same memory pressure profile — that's why the SVG pipeline uses MediaPipe via Puppeteer (G28) instead of `@imgly/background-removal-node` after the latter OOM'd at multiple input sizes. Future prompts that touch native build or heavy ML inference should factor this constraint in.

### G30. Build environment: restrict ABIs and limit Gradle parallelism for assembleDebug on RAM-constrained box (2026-05-08)

clang++ in CMake native compile can crash with STATUS_ILLEGAL_INSTRUCTION (0xC000001D) under low-memory allocation pressure when Gradle builds multiple ABIs in parallel. Even ≥ 4 GB free at build start is insufficient when peak concurrent native compilation pushes 4 ABIs × 2+ clang workers each. Recovery: pass `-PreactNativeArchitectures=arm64-v8a --max-workers=2 --no-parallel` on the assembleDebug command line. arm64-v8a is the only ABI needed for the Samsung A22 5G dev target; the other three (armeabi-v7a, x86, x86_64) are required only for release/store distribution. This roughly halves total build time and bounds peak memory. EAS release builds will still produce all four ABIs because they don't pass this CLI flag.

### G31. Never run `expo prebuild` on this project (2026-05-08)

The android/ directory is a hybrid: parts are Expo-managed (RN core, MMKV, Vision Camera, Reanimated, Skia autolinking) but the project's own MediaPipe Nitro plugin lives in a hand-maintained Gradle subproject at `android/poseplugin/` along with `android/CMakeLists.txt` and a custom JNI_OnLoad bridge wired into `MainApplication.kt` (see G3, G12, G13). `expo prebuild` regenerates android/ from Expo config and has no awareness of these manual additions — `--clean` deletes them outright; even non-clean prebuild can clobber `settings.gradle`, `app/build.gradle`, `MainApplication.kt`, and `gradle.properties`. Recovery if this ever runs: `git checkout HEAD -- android/` (assuming the tree was clean beforehand). Going forward: the committed android/ tree IS the correct prebuild output. Build directly with `./gradlew assembleDebug` from the android/ directory. Future prompts must not include `expo prebuild` in any recipe; if RN dependencies change in a way that demands a re-prebuild, that is a separate manual operation requiring careful diff review and re-application of the Nitro subproject patches, not an inline build step.

### G32. Discovered: camera frames feed MediaPipe in sensor orientation, not display orientation (2026-05-08)

While building dynamic body-bbox-driven outline positioning during Prompt A refinement, raw landmarks were inspected and found to be rotated ~90° relative to the display. For an upright user facing the front-or-back camera in portrait, shoulders 11/12 should share approximately the same `y` and differ in `x`; instead they share `x` and differ in `y`. The pose detector is consuming camera frames in their native sensor orientation (typically landscape on Android back cameras) without applying the camera's `rotationDegrees` property before MediaPipe inference. This bug has been latent since Phase 1 because: (a) the geometric silhouette (G27) is a blob that tolerates rotation, (b) match scoring compares rotated-target landmarks vs rotated-live landmarks so the rotation cancels for symmetric poses, (c) the static SVG renderer doesn't interpret landmark geometry. The rotation must be applied inside the Nitro plugin's Kotlin analyzer before the image reaches MediaPipe (not in JS). This will be addressed in a separate focused prompt before dynamic outline positioning is re-enabled. Until then: SVG outline renders statically centered, match scoring continues to work for symmetric poses, asymmetric pose accuracy is reduced (also deferred).

### G33. Camera frame rotation applied to MediaPipe input via manual bitmap rotation in Nitro plugin analyzer (2026-05-10)

Resolves G32. The Vision Camera `Frame` reaches the analyzer as a CameraX `ImageProxy` with `imageInfo.rotationDegrees` indicating the clockwise rotation needed to make the buffer upright in display orientation. The analyzer (`HybridPoseLandmarkerOutput`) now: (1) pins `outputOrientation` to `UP` with a no-op setter so Vision Camera's per-frame device-orientation updates can't bounce `imageAnalysis.targetRotation` between 0/90/180/270 (and thereby make `imageInfo.rotationDegrees` unstable), (2) decodes the RGBA_8888 ImageProxy to a `Bitmap` via the standard CameraX `ImageProxy.toBitmap()` extension, (3) rotates that bitmap with `Matrix.postRotate(rotationDegrees)` and recycles the source, (4) hands the upright bitmap to MediaPipe via `BitmapImageBuilder` and calls the original `detectForVideo(mpImage, frameTsMs)` overload (no `ImageProcessingOptions`).

The first attempt — `ImageProcessingOptions.setRotationDegrees(image.imageInfo.rotationDegrees)` on every `detectForVideo` call — was accepted by MediaPipe Tasks 0.10.21 without error but did NOT actually rotate the input image on this stack (Vision Camera 5, CameraX 1.7.0-alpha01, Samsung Galaxy back camera): landmarks still came back collapsed against the sensor-orientation axis (shoulders sharing `x`, differing in `y`). Manual bitmap rotation works because we control the pixels MediaPipe sees and don't depend on a per-task ImageProcessingOptions implementation that may or may not honor the rotation hint for `PoseLandmarker`.

The 33-landmark data contract emitted to JS is unchanged — only the orientation the landmarks describe is corrected. For an upright portrait-mode user, shoulders 11 and 12 now share `y` and differ in `x` (verified empirically on device, May 10). The green G27 silhouette renders visibly upright. This unblocks dynamic body-bbox-driven UI positioning (Prompt A.6) and improves match scoring accuracy for asymmetric poses (which previously worked only by symmetry of rotated-target-vs-rotated-live comparison).

**Implementation**: `android/poseplugin/src/main/java/com/margelo/nitro/aiposesuggestor/poseplugin/HybridPoseLandmarkerOutput.kt` — `outputOrientation` pin at lines 41–45, manual rotation block at lines 140–153. The fix is at the analyzer layer so all downstream consumers (G27 silhouette renderer, match scorer, Smart Suggestions, future dynamic SVG positioning) benefit without further changes.

**Known caveat**: A T-pose at 1.5–2 m from a portrait-held back camera does not produce a wrist X-spread of ≥ 0.6 (the strict criterion suggested in the original A.5 prompt), because the portrait frame is too narrow horizontally for fully-extended arms — the wrists extend off-frame on both sides. The qualitative criterion (nose `y` < shoulders `y` < hips `y` < knees `y` < ankles `y` for an upright user) holds with all upper-body visibilities ≥ 0.97, which is the actual signature of a correctly-oriented detection. This is a property of portrait-camera FOV, not of the rotation fix.

### G35. 10 poses populated via pipeline; stubs retired; profile-left dropped (2026-05-10)

All 10 shipped library poses now derive from real source images run through `scripts/process-poses.mjs` (landmark detection via headless Chromium MediaPipe) and `scripts/generate-pose-outline.mjs` (selfie segmentation + potrace + largest-subpath + dotted stroke). 9 new poses added to `images/manifest.json`, generating 9 new SVG outline assets in `assets/poseOutlines/` and 9 new RichPose entries in `src/library/data/poses.generated.json` (alongside the pre-existing `casual-standing-01`, total 10). The legacy `STUB_RICH_POSES` array and its `buildLandmarks`/`PoseSpec`/`lm`/`HIGH`/`MED`/`normalizeOrThrow` helpers are removed from `src/library/poseLibrary.ts` since `RICH_POSE_LIBRARY = generatedPosesJson` is now the single source of truth.

Source images: 6 from Pexels (full attribution recorded in `images/source/_attribution.json`), 4 AI-generated via DALL-E 3 (arm-up-right, tpose, thinker; the AI route was used wherever Pexels failed the pipeline's 30/33 landmark visibility gate). Image source files are gitignored; landmarks + SVGs + manifest + attribution metadata are committed. `ImageAttribution.source` extended with `'ai-generated'` and an optional `aiPrompt` field to keep the AI-sourced provenance auditable. `src/ui/overlays/poseOutlineAssetMap.ts` updated with a static `require()` entry per new pose so Metro's literal-string requirement is satisfied.

profile-left was attempted with both Pexels (rejected: occluding ao dai dress) and DALL-E 3 (rejected: structural rear-arm occlusion in any meaningful three-quarter turn — MediaPipe consistently produces 28/33 landmarks, below the 30/33 validation gate, regardless of which arm is forward). Dropped from the library; can be revisited as a redesigned pose (e.g. body facing forward with head turn only) in a future iteration.

### G36. Dynamic body-bbox positioning of the dotted outline (2026-05-10)

The PoseOutlineSvg renderer is now wrapped in a transform-bearing View that translates and scales the outline to match the user's detected body in real time. The body bounding box is computed as the smallest axis-aligned box enclosing all visible body landmarks (nose, shoulders, elbows, wrists, hips, knees, ankles) via `src/ui/overlays/bodyBoundingBox.ts`. The bbox requires anchor landmarks at nose, at least one shoulder, and at least one hip (all at visibility ≥ 0.5), plus a minimum of 5 visible body points total and a padded body height ≥ 10% of frame height to be considered valid. Smoothing via exponential filter (alpha = 0.3) at `src/ui/overlays/outlineSmoothing.ts` removes per-frame jitter; landmark loss (or staleness > 250 ms on the latest frame timestamp, since native silently drops no-person frames per G32 staleness note in MEMORY.md) triggers an 800 ms hold followed by a 300 ms opacity fade so the outline doesn't snap or vanish abruptly. A 50 ms heartbeat interval drives the smoothing loop independently of the landmark callback rate, which both keeps the fade animation visibly smooth and ensures the missing-update path fires when no fresh frames are arriving. Resolves G32.

A first attempt computed centerX/centerY as the torso centroid (average of shoulders + hips) and height as ankle-Y minus nose-Y. Device-verify on May 10 showed the outline floated 7–10% above the body's visual center because the torso centroid sits well above the head-to-feet midpoint for an upright human; the directional response (scale, horizontal translation, hold/fade) was correct but absolute centering was off. Switching to the axis-aligned visible-extent bbox fixed this — the bbox center is the midpoint of topmost and bottommost visible body landmarks, which is by construction the visual center of the body extent the user sees in frame. Knees and ankles join the bbox when visible (extending it to the feet) and gracefully drop out when occluded, in which case the bbox tightens to upper body — still better than the torso-centroid drift it replaced.

The G27 geometric silhouette dev-fallback path is unaffected — when no SVG asset exists for a pose (only relevant in development for poses outside the 10-pose library), the static silhouette still renders.

### G37. Live skeleton removed from camera UI; dotted outline white→green match transition (2026-05-10)

The standalone live G27 silhouette overlay over the camera preview has been removed entirely from CameraScreen. Production users — and dev users — see only: the camera preview, the dotted SVG outline (target pose), and the match-score feedback UI, matching the original "no skeleton, no joint markers, no motion-capture look" spec. Initial implementation gated the mount with `__DEV__` but device-verify (Samsung A22 5G, dev build) showed the green silhouette was still distracting in the dev experience; since the live skeleton no longer informs anything user-facing (matching is driven by raw landmark distances, surfaced through the match-score card and worst-joint hints) we deleted the mount outright. The `PoseSkeleton` component itself remains in the codebase as a debugging tool that can be remounted ad hoc. The G27 dev-fallback inside `PoseTargetOverlay` (rendered when no SVG asset exists for a pose) is intentionally NOT removed — it remains active in dev to surface missing SVG assets during library expansion, and renders TARGET landmarks rather than live ones.

The dotted outline stroke transitions from white (`#FFFFFF`) to green (`#22C55E`) when match score crosses 75% (with hysteresis: leaves matched state below 65%) to prevent flicker around the threshold. The crossfade is implemented as two stacked `PoseOutlineSvg` layers inside `DynamicPoseOutline`, one white and one green, with opposite Reanimated `withTiming` opacity animations (250 ms duration). Reanimated was already a dependency (used by `MatchFeedback` for the matched-state pulse) so this introduces no new dep. The Reanimated opacities multiply with the parent View's `smoothed.opacity` from G36, so the hold/fade-on-landmark-loss behavior is unaffected. Hysteresis values (enter 0.75, exit 0.65 against `matchPose.fitScore` ∈ [0,1]) are local to `PoseTargetOverlay` and independent of the existing `MATCHED_THRESHOLD = 0.85` used by `MatchFeedback`'s state bucketing — the outline color and the percent-card color have separate user contracts and can be tuned independently. Values were chosen to feel responsive but not jumpy at typical detection accuracy levels (10–15 fps GPU inference on Samsung A22 5G).

Two unrelated debug overlays remain visible in all builds (deferred): the top-left `DebugOverlay` HUD (Detecting / fps / inference ms / nose coords) and the bottom-center `MockPoseControls` ("Inject T-Pose" / "Clear" buttons). Neither is gated by `__DEV__` today; flagged for follow-up.
