# Model files

These are the two MediaPipe model assets the perception layer loads at
`/models/*` at runtime. They are **not checked into the repo** (they are
large binaries) and must be downloaded once, locally, before `npm run dev`
will produce a working camera screen. Downloading happens at build time on
your machine, not at runtime in the shipped app - the running app never
makes a network request (CLAUDE.md constraint 2).

| File | Approx. size | Used by |
|---|---|---|
| `face_landmarker.task` | ~3.6 MB | `src/perception/face.ts` (`FaceLandmarker`) |
| `efficientdet_lite0.tflite` | ~4.5 MB | `src/perception/objects.ts` (`ObjectDetector`) |

## Download

```bash
curl -L -o public/models/face_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

curl -L -o public/models/efficientdet_lite0.tflite \
  https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite
```

Both URLs are Google's public MediaPipe model bucket (the same source
referenced in PRD §4). If Google reorganizes the bucket path, check
https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker and
https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector for
the current `.task` / `.tflite` links.

## Verify

After downloading, `public/models/` should contain exactly these two files
plus this README. `src/perception/face.ts` and `objects.ts` point at
`/models/face_landmarker.task` and `/models/efficientdet_lite0.tflite`
respectively - do not rename them without updating both files.
