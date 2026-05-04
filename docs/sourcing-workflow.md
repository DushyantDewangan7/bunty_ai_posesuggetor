# Pose-image sourcing workflow

This is the manual onramp for adding new reference poses to the library. Each
session, you find images, write metadata for them in `images/manifest.json`,
and run the pipeline. The pipeline detects 33 MediaPipe landmarks per image,
validates them, normalizes them to the canonical pose space the on-device
runtime emits, and writes [src/library/data/poses.generated.json](../src/library/data/poses.generated.json).
The library merges those entries with the legacy hand-authored stubs at
import time — see [src/library/poseLibrary.ts](../src/library/poseLibrary.ts).

## Prerequisites (one-time)

`npm install` already pinned the deps. Node 24+ is required (uses native
TypeScript stripping so the `.mjs` script can `import` from `.ts`).

## Sourcing an image

### Allowed sources

| Source | License | Attribution required |
|---|---|---|
| Pexels (`pexels.com`) | Pexels License | photographer name + Pexels URL |
| Unsplash (`unsplash.com`) | Unsplash License | photographer name + Unsplash URL |
| Wikimedia Commons | Public Domain or CC0 | author name + commons URL (skip CC-BY-SA — the share-alike clause is a hassle for a closed app) |

Do not use Google Image Search, random social-media reposts, or stock sites
without explicit permissive licenses. If you cannot identify the original
licensor, skip the image.

### Quality bar

The pipeline rejects images where:

- MediaPipe Pose Lite cannot find a person at all, or
- Fewer than 30 of 33 landmarks have visibility ≥ 0.5, or
- Any of the four anchor landmarks (left/right hip, left/right shoulder)
  has visibility < 0.5 (these are required to define the canonical frame).

To stay above this bar, prefer images with:

- A single subject filling most of the frame (group shots are fine if one
  subject is clearly dominant, but expect higher rejection rate).
- Plain or evenly-lit background — busy backgrounds reduce landmark confidence.
- Subject facing the camera or at most 3/4 turn. Pure profile shots often
  hide one hip/shoulder and fail anchor visibility.
- Hips and shoulders unobstructed by furniture, props, or clothing folds.
- 1080p or higher; very small images yield noisy landmarks.

## Adding the image

1. Save the JPEG into [images/source/](../images/source/) with a numbered,
   slug-cased name: `pose-001-power-stance.jpg`, `pose-002-casual-lean.jpg`,
   etc. (`images/source/` is gitignored — only the manifest and generated
   data are committed.)

2. Append a metadata entry to [images/manifest.json](../images/manifest.json):

   ```json
   {
     "imageFile": "pose-001-power-stance.jpg",
     "metadata": {
       "id": "power-stance-01",
       "name": "Power stance",
       "description": "Confident standing pose, feet shoulder-width apart, hands on hips",
       "category": "standing",
       "tags": ["confident", "professional", "lifestyle"],
       "difficulty": 1,
       "genderOrientation": "neutral",
       "bodyTypeHints": [],
       "moodTags": ["confident", "professional"],
       "useCase": ["fashion", "casual", "wedding"],
       "lightingRecommendation": "any",
       "recommendedClothing": "any",
       "groupSize": 1,
       "locationType": "any",
       "imageAttribution": {
         "source": "pexels",
         "url": "https://www.pexels.com/photo/...",
         "author": "Photographer Name",
         "license": "Pexels License"
       }
     }
   }
   ```

   Field reference: [src/types/poseMetadata.ts](../src/types/poseMetadata.ts).
   `id` must be unique across the entire library (including the legacy stubs
   in [src/library/poseLibrary.ts](../src/library/poseLibrary.ts)).

## Running the pipeline

```
npm run process-poses
```

The script:

1. Reads [images/manifest.json](../images/manifest.json).
2. If the manifest is empty, writes `[]` to
   [src/library/data/poses.generated.json](../src/library/data/poses.generated.json)
   and exits — useful for resetting after deletions.
3. Otherwise launches headless Chromium via Puppeteer, loads
   [scripts/mediapipe-host.html](../scripts/mediapipe-host.html), and waits
   for `pose_landmarker_lite.task` (same model the on-device runtime uses) to
   initialize.
4. For each manifest entry: loads the image with sharp, sends it to the
   page, runs `PoseLandmarker.detect`, validates and normalizes the
   landmarks, and accumulates a `RichPose` record.
5. Writes the merged, sorted-by-id array to `poses.generated.json`.
6. Prints `summary: X processed, Y validated, Z rejected`.

First run downloads ~60MB of Chromium and the MediaPipe model — slow.
Subsequent runs are fast.

## Interpreting `images/rejected.txt`

Rejections append to [images/rejected.txt](../images/rejected.txt) (gitignored)
with timestamp, filename, and reason. Common cases:

| Reason | What to do |
|---|---|
| `image file missing in images/source/` | The manifest references a file you haven't dropped in yet. |
| `PoseLandmarker returned no person` | Pick a clearer, less-cluttered image. |
| `only N/33 landmarks have visibility >= 0.5` | The pose is too occluded — try a less obstructed shot. |
| `anchor landmark X visibility ... < 0.5` | A hip or shoulder is hidden — switch to a more frontal angle. |
| `normalizePose returned null ...` | Same root cause as anchor visibility, caught one layer deeper. |

Re-source if the pose category is important; otherwise skip and move on.
You can re-run the pipeline as many times as you like — it always rewrites
`poses.generated.json` from scratch.

## Verifying in the app

1. `npm run typecheck` — should pass.
2. `npm run lint` — should pass (the `scripts/patch-nitrogen.cjs` warning
   about `__dirname` is pre-existing and unrelated).
3. Build / launch the app on device. Open the pose selector. New entries
   appear after the 10 hand-authored stubs.
4. Try matching: stand in front of the camera and assume the pose. The
   match feedback should reach `matched` when you mirror the reference.
   If matching fails consistently, the image was probably oriented or
   cropped weirdly — try a different image of the same pose.

## Volume target

Phase 3A ships ~50 reference poses across `standing`, `sitting`, `fitness`,
`lifestyle`, and `group` categories. Pace yourself — aim for 5-10 per
session and keep a clean rejection log so you can see which sources have
the highest yield.
