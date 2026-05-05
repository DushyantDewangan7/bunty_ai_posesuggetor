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

