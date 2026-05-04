# AI Pose Suggestor

An AI-powered pose suggester for the Indian market: it watches the camera feed, infers a body pose, and recommends visually appealing poses tuned to the scene and the user's body. This repo is the **Phase 0** scaffold — a clean React Native app, built with Expo + Dev Client, that boots a full-screen back-camera preview with an empty Skia overlay layer waiting for ML integration.

> Phase 0 ships only the scaffolding: the project, the camera preview, the empty drawing layer, the permission flow, the folder structure, and the build pipeline. No ML, no recommendations, no library — those are later phases.

---

## Quick start

```bash
# Install dependencies (versions are pinned — do not pass --save / -E flags by hand)
npm install

# Type-check
npm run typecheck

# Lint
npm run lint

# Auto-format
npm run format

# Build & run on Android (a device or emulator must be attached)
npx expo run:android
```

`npx expo run:android` does the full native build (Gradle + autolinking) and installs the Dev Client on your device. The first run can take 10–15 minutes; subsequent runs are incremental.

### Android prerequisites

- Android Studio with the SDK Platform Tools and at least one platform image installed
- A physical device with USB debugging enabled, or a running AVD
- `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) pointing at your SDK install
- `JAVA_HOME` pointing at JDK 17+ (JDK 21 LTS works)
- `adb devices` should list at least one device before you run the build

### iOS

iOS support comes for free via Expo but is **not tested in Phase 0**. You can run `npx expo prebuild --platform ios` and `npx expo run:ios` on macOS, but expect to fix small things — no Phase 0 acceptance criteria depend on it.

---

## Folder structure

```
src/
  camera/         # Camera session helpers, frame-processor wiring (Phase 1+)
  ml/             # Pose inference, model loading, post-processing (Phase 1+)
  recommendation/ # Pose recommendation engine (Phase 5+)
  library/        # Saved poses, history, favorites (Phase 6+)
  ui/
    overlays/     # Skia overlays (skeleton, pose ghosts, guides) (Phase 1+)
    screens/      # Screen-level components — CameraScreen.tsx lives here
    components/   # Shared UI primitives
  state/          # Zustand stores
  types/          # Shared TS types
  utils/          # Misc helpers
```

Empty folders carry a `.gitkeep` so git tracks them.

Root config:

- `app.json` — Expo config (slug, bundle IDs, permissions, plugins)
- `eas.json` — EAS build profiles (development, preview, production)
- `babel.config.js` — Reanimated plugin (must remain last)
- `tsconfig.json` — extends `expo/tsconfig.base` with strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- `eslint.config.js` — flat-config ESLint with `eslint-config-expo/flat` + Prettier integration
- `.prettierrc` — formatting rules

---

## Phase 0 — what is in scope

- ✅ Expo SDK 54 (RN 0.81, React 19) project bootstrapped via `create-expo-app` with the `blank-typescript` template
- ✅ TypeScript strict mode, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- ✅ New Architecture (Fabric + TurboModules) enabled
- ✅ Dev Client (no Expo Go)
- ✅ Allowlisted libraries installed and **pinned to exact versions** (no `^` / `~`)
- ✅ Full-screen back-camera preview via `react-native-vision-camera`
- ✅ Empty `<Canvas>` Skia overlay covering the preview, with a Phase 1 TODO for the skeleton
- ✅ Camera permission flow with the user-facing rationale string in the spec, plus a settings deep-link via `react-native-permissions`
- ✅ "No camera available" fallback for emulators without a camera
- ✅ Folder structure for ML / recommendation / library / UI work in later phases
- ✅ ESLint flat config + Prettier; `npm run lint` and `npm run typecheck` pass with zero errors
- ✅ EAS build profiles (development, preview, production)

---

## Phase 0 — what is out of scope (deferred)

These are intentionally **not** installed and **not** wired up:

| Library / capability                                                   | Phase        |
| ---------------------------------------------------------------------- | ------------ |
| `react-native-mediapipe` (live pose detection)                         | Phase 1      |
| `react-native-fast-tflite` (on-device TFLite inference)                | Phase 2      |
| `@op-engineering/op-sqlite` (local persistence)                        | Phase 3      |
| `@react-native-ml-kit/*` (face / text / barcode features)              | Phase 4      |
| `@react-native-firebase/*` (analytics, remote config, crash)           | Phase 8      |
| In-app billing, advanced analytics, navigation libraries beyond basics | later phases |
| NativeWind / Tailwind RN, OpenCV                                       | later phases |

Don't add these in Phase 0 — the dependency conflicts they create are painful to unwind.

---

## Phase 1 preview

Phase 1 will integrate `react-native-mediapipe` for live pose detection and render a 33-point skeleton in the Skia overlay layer that already sits over the camera preview.

---

## Decisions worth knowing about

Phase 1 fully verified including match scoring (ADR G16). Phase 2 sub-phase A verified (ADR G15).

A few things deviated from the original Phase 0 plan because the React Native ecosystem moved forward. They were chosen deliberately, not silently.

### 1. Vision Camera 5 + Reanimated 4 (not v4 / v3)

The original plan asked for `react-native-vision-camera` v4 and `react-native-reanimated` v3. With Expo SDK 54 (RN 0.81 + New Architecture), `npx expo install` resolves to **Vision Camera 5.0.8** and **Reanimated 4.1.7** — that's what the SDK 54 compatibility matrix actually supports. Forcing the older majors onto SDK 54 would mean overriding `expo install` and fighting peer-dep checks forever. We accepted the resolved versions; install completed with **no peer-dep warnings**.

Implications for Phase 1:

- Vision Camera 5 has a different frame-processor API than v4 (`useFrameProcessor` types and worklet plugin registration changed). Phase 1's MediaPipe wiring needs the v5 docs, not v4.
- Reanimated 4 is built on top of `react-native-worklets` (the new package). Its babel plugin lives at `react-native-worklets/plugin`, but `react-native-reanimated/plugin` re-exports it, so the historical config string still works.

### 2. Vision Camera v5 dropped its config plugin

Vision Camera v4 had an Expo config plugin you registered in `app.json`. Vision Camera v5 removed it. Camera permissions are now configured directly:

- Android: `android.permissions: ["CAMERA", ...]` in `app.json`
- iOS: `ios.infoPlist.NSCameraUsageDescription` in `app.json` carries the rationale string

The runtime rationale UI still lives in `src/ui/screens/CameraScreen.tsx` as the spec required.

### 3. `react-native-worklets-core` was removed in Phase 0, reinstated in Phase 1

The original plan asked for `react-native-worklets-core`. During the Phase 0 Android build we hit a hard `[CXX1104]` error claiming `android.ndkVersion [27.0.12077973]` disagreed with our installed NDK r27b (`27.1.12297006`). We removed worklets-core (and `vision-camera-resize-plugin`, which depended on it) to unblock the Phase 0 build. Inspection in Phase 1 showed `worklets-core@1.6.3` does **not** pin a hardcoded NDK; the version mismatch came from a stale `rootProject.ext.ndkVersion` early in the Phase 0 build. With the working Phase 0 state (rootProject inherits NDK r27b from RN 0.81 / Expo SDK 54), reinstalling `worklets-core@1.6.3` in Phase 1 produced **no peer-dep warnings and no NDK conflict**.

`vision-camera-resize-plugin` was **not** reinstalled — see decision 7 below.

### 4. `babel-preset-expo` added as an explicit dev dependency

In Expo SDK 54, `babel-preset-expo` ships nested under `node_modules/expo/node_modules/`. Metro / `@babel/core` resolve the preset via Node module resolution from the project root, which fails to find a nested copy. The first JS bundle attempt errored with `Cannot find module 'babel-preset-expo'`. We installed it as a top-level `devDependency` (pinned to 54.0.10) and Metro now resolves it. This is a known SDK 54 quirk for projects that have a `babel.config.js` (we need one for the Reanimated plugin).

### 5. ESLint 9 + flat config (`eslint.config.js`, not `.eslintrc.js`)

ESLint 9 dropped automatic discovery of `.eslintrc.*`. The config lives in `eslint.config.js` using flat config — `eslint-config-expo` ships a flat-config entry (`eslint-config-expo/flat`) that we extend, with `eslint-plugin-prettier/recommended` appended last so Prettier disagreements turn into lint errors and Prettier's rule set wins formatting conflicts.

### 6. Nitro Modules came in transitively

Vision Camera 5 and `react-native-mmkv` 4 both depend on `react-native-nitro-modules` (and Vision Camera adds `react-native-nitro-image`). They are not top-level deps in `package.json` but autolinking picks them up via the transitive install. If Phase 1 needs to write a custom Nitro module, hoist it to a top-level dep then.

### 7. Phase 1: pose detection is a custom VC v5 Nitro plugin (see ADR-001)

The original plan adopted `react-native-mediapipe@0.6.0` for pose inference. During Phase 1 Track A we discovered the package directly imports `useFrameProcessor` and `VisionCameraProxy` — both removed in Vision Camera v5's Nitro-Modules rewrite. The wildcard peer-dep masked the incompatibility through `npm install`, but the JS bundle would crash at module-load time.

We surveyed alternatives over a 30-minute research window: upstream is effectively abandoned (no v5 work in 18 months), no fork has migrated, no other npm package ships a working VC v5 + MediaPipe Pose binding, and the `react-native-fast-tflite` direct-TFLite path drops MediaPipe's detector + ROI tracker (causing visible jitter on Snapdragon 480). The accepted decision was to write a small custom Kotlin Vision Camera v5 frame-processor plugin wrapping Google's `com.google.mediapipe:tasks-vision` SDK, exposed to JS via `react-native-nitro-modules`. The pattern follows `react-native-vision-camera-barcode-scanner` (first-party VC v5 Nitro plugin reference) and reuses ~70–80% of the MediaPipe-specific Kotlin code from `munishbp/react-native-mediapipe-pose-plugin`.

`react-native-mediapipe` is therefore **not** in our dependency tree.

Full reasoning, options considered, reference implementations, effort estimate, and revisit triggers are in [`docs/decisions/ADR-001-pose-detection-architecture.md`](docs/decisions/ADR-001-pose-detection-architecture.md).

### 8. `react-native-vision-camera-worklets` added (Phase 1 step 3b.5)

`useFrameOutput` (the only frame-processor API in Vision Camera v5) is shipped in a separate sister package, **`react-native-vision-camera-worklets@5.0.8`**, authored by Margelo at the same version and repo as VC core. Without it, no worklet can be attached to a `<Camera outputs={[...]}>`. We installed it (top-level dep, pinned) — there is no alternative for VC v5 frame processing.

This package is what Decision #7 (custom VC v5 Nitro plugin) actually relies on at runtime: the Nitro plugin's `HybridObject` is called from inside `onFrame: (frame) => { 'worklet'; plugin.method(frame) }` blocks, and `useFrameOutput` is what makes those blocks run on the camera-thread worklet runtime. Validated end-to-end on the Samsung A22 by a `ping()` round-trip from the worklet thread into Kotlin and back.

---

## Pinned versions

All dependency versions are pinned (no `^` / `~`). To upgrade a single package, update `package.json` to the new exact version, run `npm install`, and verify with `npm run typecheck`, `npm run lint`, and a fresh `npx expo run:android`. ML pipelines are sensitive to version drift — please don't switch back to caret ranges without a build-system reason.

---

## License

Proprietary © GrowthByte AI Labs Private Limited. All rights reserved.
