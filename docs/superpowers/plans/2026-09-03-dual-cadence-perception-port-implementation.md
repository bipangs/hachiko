# Dual-Cadence Perception Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port hachiko-desktop's proven dual-cadence perception feature (smooth, velocity-extrapolated circle overlay on Calibration, decoupled from the slower data-collection loop) into this browser codebase, replacing the current raw-landmark-dot overlay.

**Architecture:** A new lightweight `FaceDetector`-driven fast loop owns the live preview and overlay on every video frame; the existing `FaceLandmarker`-driven slow loop is narrowed to own only calibration data collection. This is a direct port of already-reviewed, already-bug-fixed code from `hachiko-desktop` - the plan gives the exact final code, not a fresh design.

**Tech Stack:** Plain TypeScript, `@mediapipe/tasks-vision` (already a dependency - `FaceDetector` is exported by the installed package, no new dependency needed).

**Spec:** `docs/superpowers/specs/2026-09-03-dual-cadence-perception-port-design.md`

## Global Constraints

- No new npm dependency anywhere in this plan (`FaceDetector` is already exported by the installed `@mediapipe/tasks-vision`).
- The new model file (`blaze_face_short_range.tflite`) is NOT committed to git - documented in `public/models/README.md` and added to `tools/fetch-assets.mjs`, matching this repo's existing convention for the other two models.
- No color anywhere is red.
- `src/engine/` and `calibrate()`'s own algorithm are untouched.
- The Session screen's own detection cadence and `startPerceptionLoop`'s existing contract are untouched.
- No `requestAnimationFrame` anywhere - only `video.requestVideoFrameCallback()`.

---

### Task 1: Document and fetch the BlazeFace model

**Files:**
- Modify: `public/models/README.md`
- Modify: `tools/fetch-assets.mjs`

**Interfaces:**
- Produces: `public/models/blaze_face_short_range.tflite` present on disk after `npm run dev`/`npm run build` (developer machines) or after `node tools/fetch-assets.mjs` runs (CI/deploy) - Task 2's `faceBox.ts` loads it from `/models/blaze_face_short_range.tflite` at runtime.

- [ ] **Step 1: Add the model to the README**

Find the end of the model table in `public/models/README.md`:

```markdown
| `efficientdet_lite0.tflite` | ~4.5 MB | `src/perception/objects.ts` (`ObjectDetector`) |
```

Add a new row immediately after it:

```markdown
| `efficientdet_lite0.tflite` | ~4.5 MB | `src/perception/objects.ts` (`ObjectDetector`) |
| `blaze_face_short_range.tflite` | ~225 KB | `src/perception/faceBox.ts` (`FaceDetector`) - live calibration preview overlay only |
```

Then find the Download section's code block:

```bash
curl -L -o public/models/face_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

curl -L -o public/models/efficientdet_lite0.tflite \
  https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite
```

Replace it with:

```bash
curl -L -o public/models/face_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

curl -L -o public/models/efficientdet_lite0.tflite \
  https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite

curl -L -o public/models/blaze_face_short_range.tflite \
  https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite
```

Finally, find the Verify section:

```markdown
After downloading, `public/models/` should contain exactly these two files
plus this README. `src/perception/face.ts` and `objects.ts` point at
`/models/face_landmarker.task` and `/models/efficientdet_lite0.tflite`
respectively - do not rename them without updating both files.
```

Replace it with:

```markdown
After downloading, `public/models/` should contain exactly these three
files plus this README. `src/perception/face.ts`, `objects.ts`, and
`faceBox.ts` point at `/models/face_landmarker.task`,
`/models/efficientdet_lite0.tflite`, and
`/models/blaze_face_short_range.tflite` respectively - do not rename any
of them without updating the corresponding file.
```

- [ ] **Step 2: Add the model to the build-time fetcher**

In `tools/fetch-assets.mjs`, find:

```js
  {
    dest: join(root, 'public', 'models', 'efficientdet_lite0.tflite'),
    url: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite',
    required: true,
  },
```

Add immediately after it:

```js
  {
    dest: join(root, 'public', 'models', 'efficientdet_lite0.tflite'),
    url: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite',
    required: true,
  },
  {
    dest: join(root, 'public', 'models', 'blaze_face_short_range.tflite'),
    url: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite',
    required: true,
  },
```

- [ ] **Step 3: Download the model locally so dev/testing works**

Run: `curl -L -o public/models/blaze_face_short_range.tflite https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite`
Expected: a ~225KB file at `public/models/blaze_face_short_range.tflite` (confirm with `ls -la public/models/`). This file is gitignored (matches the other two models) - do not `git add` it.

- [ ] **Step 4: Verify the fetch script still runs cleanly**

Run: `node tools/fetch-assets.mjs`
Expected: all four assets (two models plus BlazeFace, plus the two fonts) log `already present, skipping` - confirms Step 3's manual download satisfies the same path Step 2 wired in, and the script's syntax is valid.

- [ ] **Step 5: Typecheck and test**

Run: `npm run typecheck` - expect zero errors.
Run: `npm test` - expect all 29 existing tests to still pass (this task touches no `.ts` logic).

- [ ] **Step 6: Commit**

```bash
git add public/models/README.md tools/fetch-assets.mjs
git commit -m "Document and auto-fetch the BlazeFace short-range model for the calibration overlay port"
```

---

### Task 2: Add faceBox.ts and startFaceBoxLoop

**Files:**
- Create: `src/perception/faceBox.ts`
- Modify: `src/perception/camera.ts`

**Interfaces:**
- Consumes: `blaze_face_short_range.tflite` at `/models/blaze_face_short_range.tflite` (Task 1).
- Produces: `createFaceDetector(): Promise<FaceDetector>`, `readFaceBox(detector, video, timestampMs): FaceBox | null`, `FaceBox` type (all from `faceBox.ts`) - Task 3 imports `createFaceDetector`; Task 4 imports `FaceBox`. `startFaceBoxLoop(video, detector, onBox): OverlayLoopHandle` and `OverlayLoopHandle` (from `camera.ts`) - Task 4 imports both.

- [ ] **Step 1: Create faceBox.ts**

```typescript
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'

// Self-hosted, never a CDN (CLAUDE.md constraint 2). See tools/copy-wasm.mjs
// and public/models/README.md.
const WASM_BASE = '/wasm'
const MODEL_PATH = '/models/blaze_face_short_range.tflite'

export interface FaceBox {
  originX: number
  originY: number
  width: number
  height: number
}

/**
 * BlazeFace short-range: bounding-box-only detection, no landmarks/pose -
 * everything the fast preview overlay actually needs, at a fraction of
 * FaceLandmarker's cost (Google's own benchmark: ~2.94ms CPU latency),
 * which is why this runs on CPU directly with no GPU-delegate-with-
 * fallback complexity - at this latency there's no meaningful benefit to
 * a GPU delegate, and skipping it avoids paying that delegate's own
 * init/failure-mode complexity for a task this cheap.
 */
export async function createFaceDetector(): Promise<FaceDetector> {
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE)
  return FaceDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' },
    runningMode: 'VIDEO',
  })
}

export function readFaceBox(detector: FaceDetector, video: HTMLVideoElement, timestampMs: number): FaceBox | null {
  const result = detector.detectForVideo(video, timestampMs)
  const box = result.detections[0]?.boundingBox
  return box ? { originX: box.originX, originY: box.originY, width: box.width, height: box.height } : null
}
```

- [ ] **Step 2: Add startFaceBoxLoop to camera.ts**

In `src/perception/camera.ts`, find the top import line:

```typescript
import type { FaceLandmarker, ObjectDetector } from '@mediapipe/tasks-vision'
import { readFace, type FaceReading } from './face'
import { detectObjects } from './objects'
```

Replace it with:

```typescript
import type { FaceDetector, FaceLandmarker, ObjectDetector } from '@mediapipe/tasks-vision'
import { readFace, type FaceReading } from './face'
import { readFaceBox, type FaceBox } from './faceBox'
import { detectObjects } from './objects'
```

Then, at the end of the file (after `startPerceptionLoop`'s closing `}`), add:

```typescript

export interface OverlayLoopHandle {
  stop: () => void
}

/**
 * Simpler than startPerceptionLoop: one job (feed the live preview's
 * overlay), no interval throttling - the whole point is running on
 * every frame, since the model behind onBox is cheap enough to afford
 * that (see faceBox.ts).
 */
export function startFaceBoxLoop(
  video: HTMLVideoElement,
  detector: FaceDetector,
  onBox: (box: FaceBox | null, timestampMs: number) => void,
): OverlayLoopHandle {
  let stopped = false
  let lastTimestampMs = -1

  const onFrame: VideoFrameRequestCallback = () => {
    if (stopped) return
    let timestampMs = Math.round(performance.now())
    // MediaPipe requires strictly increasing timestamps across calls to a
    // shared detector; unlike startPerceptionLoop's throttle, this loop
    // runs unthrottled on every video frame, so two frames landing in the
    // same rounded millisecond (a compositor stall, tab visibility change)
    // is rare but not impossible over a 15s window sampled 30-60x/sec.
    if (timestampMs <= lastTimestampMs) timestampMs = lastTimestampMs + 1
    lastTimestampMs = timestampMs
    try {
      onBox(readFaceBox(detector, video, timestampMs), timestampMs)
    } catch (err) {
      // Never let one bad frame kill the loop permanently - a frozen
      // preview is worse than a dropped frame.
      console.error('[hachiko] face box loop', err)
    }
    if (!stopped) video.requestVideoFrameCallback(onFrame)
  }

  video.requestVideoFrameCallback(onFrame)

  return {
    stop: () => {
      stopped = true
    },
  }
}
```

- [ ] **Step 3: Typecheck and test**

Run: `npm run typecheck` - expect zero errors.
Run: `npm test` - expect all 29 tests to still pass.

- [ ] **Step 4: Commit**

```bash
git add src/perception/faceBox.ts src/perception/camera.ts
git commit -m "Add faceBox.ts and startFaceBoxLoop: unthrottled face-box tracking for the live preview"
```

---

### Task 3: Extend PerceptionBundle, wire into framing.ts

**Files:**
- Modify: `src/perception/bundle.ts`
- Modify: `src/ui/screens/framing.ts`

**Interfaces:**
- Consumes: `createFaceDetector` from `../../perception/faceBox` (Task 2).
- Produces: `PerceptionBundle.faceDetector: FaceDetector` - Task 4's `calibration.ts` reads `bundle.faceDetector`.

- [ ] **Step 1: Extend PerceptionBundle**

Replace the full content of `src/perception/bundle.ts`:

```typescript
import type { FaceDetector, FaceLandmarker, ObjectDetector } from '@mediapipe/tasks-vision'
import type { CameraSession } from './camera'

/** Everything downstream screens (calibration, session) need, created once in framing.ts. */
export interface PerceptionBundle {
  camera: CameraSession
  faceLandmarker: FaceLandmarker
  objectDetector: ObjectDetector
  faceDetector: FaceDetector
}
```

- [ ] **Step 2: Create the FaceDetector in framing.ts and reduce its own loop's face interval**

In `src/ui/screens/framing.ts`, find:

```typescript
import { startCamera, startPerceptionLoop, type PerceptionLoopHandle } from '../../perception/camera'
import { createFaceLandmarker } from '../../perception/face'
import { createObjectDetector } from '../../perception/objects'
import type { PerceptionBundle } from '../../perception/bundle'
```

Replace with:

```typescript
import { startCamera, startPerceptionLoop, type PerceptionLoopHandle } from '../../perception/camera'
import { createFaceLandmarker } from '../../perception/face'
import { createObjectDetector } from '../../perception/objects'
import { createFaceDetector } from '../../perception/faceBox'
import type { PerceptionBundle } from '../../perception/bundle'
```

Then find:

```typescript
        const [faceLandmarker, objectDetector] = await Promise.all([createFaceLandmarker(), createObjectDetector()])
        bundle = { camera, faceLandmarker, objectDetector }

        loop = startPerceptionLoop(video, faceLandmarker, objectDetector, (tick) => {
          if (tick.face) continueBtn.disabled = !tick.face.faceFound
        })
```

Replace with:

```typescript
        const [faceLandmarker, objectDetector, faceDetector] = await Promise.all([
          createFaceLandmarker(),
          createObjectDetector(),
          createFaceDetector(),
        ])
        bundle = { camera, faceLandmarker, objectDetector, faceDetector }

        // Slower than the default 5fps: this screen only checks
        // faceFound to enable Continue, nothing time-sensitive, and
        // detectForVideo runs synchronously - at the default rate its
        // periodic blocking was visible as stutter in the live preview.
        // Session.ts never shows the preview at all, so its own
        // detection rate is untouched.
        loop = startPerceptionLoop(video, faceLandmarker, objectDetector, (tick) => {
          if (tick.face) continueBtn.disabled = !tick.face.faceFound
        }, 1000)
```

- [ ] **Step 3: Typecheck and test**

Run: `npm run typecheck` - expect zero errors (this also confirms the third `Promise.all` entry didn't break anything - the existing `try`/`catch` around it already covers a third promise added to that same array, no new error-handling code needed).
Run: `npm test` - expect all 29 tests to still pass.

- [ ] **Step 4: Commit**

```bash
git add src/perception/bundle.ts src/ui/screens/framing.ts
git commit -m "Create the FaceDetector once in framing.ts, add it to PerceptionBundle"
```

---

### Task 4: Restructure calibration.ts into fast (preview) and slow (data collection) loops

**Files:**
- Modify: `src/ui/screens/calibration.ts`
- Modify: `src/styles/base.css` (one small addition, see Step 1)

**Interfaces:**
- Consumes: `startFaceBoxLoop`, `OverlayLoopHandle` from `../../perception/camera` (Task 2); `FaceBox` from `../../perception/faceBox` (Task 2); `bundle.faceDetector` from `../../perception/bundle` (Task 3).
- Produces: no new external interface - `renderCalibration`'s own signature and return type (`Promise<{ cone: Cone }>`) are unchanged; this task only restructures the function's internals and replaces the old dot overlay with a circle overlay.

This is the task that actually implements the split and the new overlay. Read the full current file at `src/ui/screens/calibration.ts` before starting.

- [ ] **Step 1: Make the canvas fill its container explicitly**

In `src/styles/base.css`, find:

```css
.camera-preview canvas {
  position: absolute;
  inset: 0;
  transform: scaleX(-1);
  pointer-events: none;
}
```

Replace with:

```css
.camera-preview canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: scaleX(-1);
  pointer-events: none;
}
```

(Explicit, not left to `inset: 0` alone - the canvas draws the video frame itself as of this task, so it becomes the camera preview's sole visual surface and must reliably fill the box regardless of its own intrinsic pixel dimensions.)

- [ ] **Step 2: Replace the whole file**

Replace the full content of `src/ui/screens/calibration.ts`:

```typescript
import { strings } from '../strings'
import { actions, body, button, el, screen, title } from '../components'
import { cssVar } from '../theme'
import { startPerceptionLoop, startFaceBoxLoop } from '../../perception/camera'
import type { PerceptionBundle } from '../../perception/bundle'
import type { FaceBox } from '../../perception/faceBox'
import { calibrate } from '../../engine/calibrate'
import { DEFAULT_CONFIG } from '../../engine/config'
import type { Cone, Frame } from '../../engine/types'

const CALIBRATION_MS = 15_000
const RING_RADIUS = 42
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
// Beyond this many ms since the last real detection, extrapolation stops
// advancing and the overlay holds at its last known position instead of
// drifting indefinitely on a real multi-frame gap (e.g. face left frame).
const EXTRAPOLATION_CAP_MS = 150

interface BoxReading {
  centerX: number
  centerY: number
  radius: number
  at: number
}

function progressRing(): { element: HTMLDivElement; setProgress: (ratio: number, label: string) => void } {
  const value = el('div', { class: 'progress-ring__value', 'aria-hidden': 'true' }, [''])
  const element = el('div', { class: 'progress-ring' })
  element.innerHTML = `
    <svg viewBox="0 0 96 96">
      <circle class="progress-ring__track" cx="48" cy="48" r="${RING_RADIUS}" />
      <circle class="progress-ring__fill" cx="48" cy="48" r="${RING_RADIUS}"
              stroke-dasharray="${RING_CIRCUMFERENCE}" stroke-dashoffset="${RING_CIRCUMFERENCE}" />
    </svg>
  `
  element.append(value)
  const fill = element.querySelector<SVGCircleElement>('.progress-ring__fill')

  return {
    element,
    setProgress: (ratio: number, label: string) => {
      const clamped = Math.min(1, Math.max(0, ratio))
      if (fill) fill.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - clamped))
      value.textContent = label
    },
  }
}

export function renderCalibration(
  root: HTMLElement,
  video: HTMLVideoElement,
  bundle: PerceptionBundle,
): Promise<{ cone: Cone }> {
  return new Promise((resolve) => {
    const s = strings.calibration
    const { root: screenEl, content } = screen()

    const status = body(s.body)
    const ring = progressRing()
    ring.setProgress(0, '15')
    const countdown = el('p', { class: 'screen__body' }, [s.counting(15)])
    const preview = el('div', { class: 'camera-preview' })
    const canvas = el('canvas', {})
    // The canvas draws the video frame itself (see the tick loop below) and
    // becomes the sole visual surface - the <video> element stays in the
    // DOM only because requestVideoFrameCallback/MediaPipe need a live
    // source to read from, it's never meant to be seen directly here.
    video.style.opacity = '0'
    preview.append(video, canvas)

    let cone: Cone | null = null
    const continueBtn = button(
      s.continueLabel,
      () => {
        if (!cone) return
        root.replaceChildren()
        resolve({ cone })
      },
      { disabled: true },
    )

    content.append(title(s.title), status, ring.element, countdown, preview, actions(continueBtn))
    root.replaceChildren(screenEl)

    const ctx = canvas.getContext('2d')
    const nightColor = cssVar('--night')
    const amberColor = cssVar('--amber')
    let frames: Frame[] = []
    let startT: number | null = null
    let settled = false

    // The last two known (non-null) readings and when they arrived, for
    // velocity-based extrapolation between them - both come from the fast
    // face-box loop below, which runs on every video frame, not the slow
    // FaceLandmarker loop.
    let prevReading: BoxReading | null = null
    let lastReading: BoxReading | null = null
    let smoothCenterX: number | null = null
    let smoothCenterY: number | null = null
    let smoothRadius: number | null = null
    // The target itself updates at the same rate as this blend (every
    // frame, via the fast loop), so there is much less gap to smooth over
    // than a naive lower value would assume - heavier smoothing would
    // just read as sluggish. Retune this one constant if the feel is off
    // in either direction; it is not a structural change.
    const SMOOTHING = 0.35

    // The <video> is displayed with `object-fit: cover` into `.camera-preview`,
    // whose CSS fixes `aspect-ratio: 4 / 3` (base.css) - if the camera's
    // native resolution isn't that same ratio, cover crops the sides or the
    // top/bottom off before display. The box's aspect ratio is a fixed CSS
    // constant here (not measured at runtime): it's exactly what the CSS
    // above declares, and avoids depending on any particular browser's
    // layout-measurement timing.
    const BOX_ASPECT = 4 / 3

    function coverCrop(rawW: number, rawH: number, boxAspect: number) {
      const rawAspect = rawW / rawH
      let cropX = 0
      let cropY = 0
      let visibleW = rawW
      let visibleH = rawH
      if (rawAspect > boxAspect) {
        visibleW = rawH * boxAspect
        cropX = (rawW - visibleW) / 2
      } else if (rawAspect < boxAspect) {
        visibleH = rawW / boxAspect
        cropY = (rawH - visibleH) / 2
      }
      return { cropX, cropY, visibleW, visibleH }
    }

    function boxToReading(box: FaceBox, cropX: number, cropY: number, at: number): BoxReading {
      return {
        centerX: box.originX + box.width / 2 - cropX,
        centerY: box.originY + box.height / 2 - cropY,
        radius: (box.width / 2 + box.height / 2) / 2,
        at,
      }
    }

    // --- Fast loop: live preview + overlay, every video frame ---
    const overlayLoop = startFaceBoxLoop(video, bundle.faceDetector, (box, timestampMs) => {
      if (!video.videoWidth || !video.videoHeight || !ctx) return
      const crop = coverCrop(video.videoWidth, video.videoHeight, BOX_ASPECT)

      const targetW = Math.round(crop.visibleW)
      const targetH = Math.round(crop.visibleH)
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW
        canvas.height = targetH
      }

      // Draw the current video frame every tick, cropped exactly like
      // `object-fit: cover` would - this is what keeps the preview smooth
      // at full framerate now that the <video> element itself is invisible.
      ctx.drawImage(video, crop.cropX, crop.cropY, crop.visibleW, crop.visibleH, 0, 0, canvas.width, canvas.height)

      if (box) {
        const reading = boxToReading(box, crop.cropX, crop.cropY, timestampMs)
        if (lastReading) prevReading = lastReading
        lastReading = reading
      }

      if (lastReading) {
        // Predict the current position from the last two readings'
        // velocity. Once the gap since the last real reading exceeds the
        // cap, collapse elapsed to 0 so the velocity term vanishes and the
        // overlay holds exactly at lastReading's position, instead of
        // still extrapolating a fixed 150ms ahead of it (which, at high
        // head speed, can park the circle well away from the last known
        // point during a real gap - e.g. face left the frame).
        const age = timestampMs - lastReading.at
        const elapsed = age > EXTRAPOLATION_CAP_MS ? 0 : age
        let predictedX = lastReading.centerX
        let predictedY = lastReading.centerY
        let predictedRadius = lastReading.radius
        if (prevReading && lastReading.at > prevReading.at) {
          const dt = lastReading.at - prevReading.at
          const vx = (lastReading.centerX - prevReading.centerX) / dt
          const vy = (lastReading.centerY - prevReading.centerY) / dt
          const vr = (lastReading.radius - prevReading.radius) / dt
          predictedX += vx * elapsed
          predictedY += vy * elapsed
          predictedRadius += vr * elapsed
        }

        if (smoothCenterX === null || smoothCenterY === null || smoothRadius === null) {
          smoothCenterX = predictedX
          smoothCenterY = predictedY
          smoothRadius = predictedRadius
        } else {
          smoothCenterX += (predictedX - smoothCenterX) * SMOOTHING
          smoothCenterY += (predictedY - smoothCenterY) * SMOOTHING
          smoothRadius += (predictedRadius - smoothRadius) * SMOOTHING
        }
      }

      if (smoothCenterX !== null && smoothCenterY !== null && smoothRadius !== null) {
        // Spotlight: dim everything outside the circle, leave the face
        // itself fully visible - the rect+circle path, wound in opposite
        // directions, punches a hole in the fill via the evenodd rule.
        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, canvas.width, canvas.height)
        ctx.moveTo(smoothCenterX + smoothRadius, smoothCenterY)
        ctx.arc(smoothCenterX, smoothCenterY, smoothRadius, 0, Math.PI * 2, true)
        ctx.closePath()
        ctx.fillStyle = nightColor
        ctx.globalAlpha = 0.5
        ctx.fill('evenodd')
        ctx.restore()

        ctx.strokeStyle = amberColor
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(smoothCenterX, smoothCenterY, smoothRadius, 0, Math.PI * 2)
        ctx.stroke()
      }
    })

    // --- Slow loop: calibrate()'s data collection + the countdown/ring UI ---
    // Only FaceLandmarker's yaw/pitch feed calibrate() - the fast loop's
    // FaceDetector above has no pose data, only a bounding box. calibrate()
    // filters by real elapsed time, not frame count, and floors its
    // tolerance estimate against a minimum, so this loop's own cadence
    // only affects sample density, not correctness.
    const dataLoop = startPerceptionLoop(video, bundle.faceLandmarker, bundle.objectDetector, (tick) => {
      if (!tick.face || settled) return

      if (startT === null) startT = tick.timestampMs
      frames.push({
        t: tick.timestampMs,
        faceFound: tick.face.faceFound,
        yaw: tick.face.yaw,
        pitch: tick.face.pitch,
        eyeBlink: tick.face.eyeBlink,
        objects: [],
      })

      const elapsedMs = tick.timestampMs - startT
      const secondsLeft = Math.max(0, Math.ceil((CALIBRATION_MS - elapsedMs) / 1000))
      countdown.textContent = s.counting(secondsLeft)
      ring.setProgress(elapsedMs / CALIBRATION_MS, String(secondsLeft))

      if (elapsedMs >= CALIBRATION_MS) {
        try {
          cone = calibrate(frames, DEFAULT_CONFIG)
          settled = true
          dataLoop.stop()
          overlayLoop.stop()
          status.textContent = s.done
          ring.setProgress(1, '✓')
          continueBtn.disabled = false
        } catch {
          // Face dropped out too much of the window - restart the clock
          // rather than hand back a cone built from too little data.
          frames = []
          startT = null
          ring.setProgress(0, '15')
        }
      }
    }, 1000)
  })
}
```

Notes on this replacement:
- `coverCrop` and `BOX_ASPECT` are new to this file (they didn't exist before this task) - the old version never needed cropping math since it drew landmark dots directly onto a canvas sized to match the raw video, not a cropped/replaced video frame.
- `dataLoop` replaces the old variable name `loop`. `overlayLoop` is new. Order matters: `overlayLoop` must be declared (the `startFaceBoxLoop(...)` call) before `dataLoop`'s callback runs and references `overlayLoop.stop()` - since the fast-loop code block already appears first in the file above, this ordering is automatically satisfied; do not reorder these two `const` declarations.
- The old dot-drawing block (`if (tick.face && ctx) { ctx.clearRect(...); for (const lm of tick.face.landmarks) {...} }`) is gone entirely - replaced by the fast loop's circle+vignette drawing.

- [ ] **Step 3: Typecheck and test**

Run: `npm run typecheck` - expect zero errors.
Run: `npm test` - expect all 29 tests to still pass (this screen has no direct unit tests - it's camera/canvas code, untestable under Node, same as the rest of `src/perception/`).

- [ ] **Step 4: Manual check (not automatable - requires a real camera and browser)**

Launch `npm run dev`, walk through to the Calibration screen, and confirm:
- The video preview looks smooth (no periodic stutter), and shows a circle around the face instead of scattered dots.
- The circle tracks the face responsively, including near the edges of the frame.
- Briefly looking away or moving quickly doesn't cause the overlay to freeze or jump to a wrong position - it should hold steady or extrapolate smoothly, then reacquire once detection resumes.
- Calibration still completes after 15 seconds and produces a working session afterward.
- If `SMOOTHING = 0.35` feels too snappy or too sluggish, retune that single constant - this is expected to possibly need a small adjustment based on real feel, exactly as it did in the original hachiko-desktop build.

- [ ] **Step 5: Commit**

```bash
git add src/styles/base.css src/ui/screens/calibration.ts
git commit -m "Split Calibration into a fast circle-overlay preview loop and a slow data-collection loop"
```

---

## Self-review notes (for the controller, not a task)

- Spec coverage: every file/change in the porting spec's "New/changed files" table has a task (Task 1: models/README/fetch-assets; Task 2: faceBox.ts/camera.ts; Task 3: bundle.ts/framing.ts; Task 4: calibration.ts/base.css).
- The extrapolation-hold fix (`age > EXTRAPOLATION_CAP_MS ? 0 : age`) and the error-containment/monotonic-timestamp guard in `startFaceBoxLoop` are both already baked into this plan's code verbatim - these were bugs the *original* hachiko-desktop build introduced and then fixed in its own review cycles; porting the already-fixed version means this plan should not need to rediscover them.
- No task touches `src/engine/`, `session.ts`'s detection cadence, or `calibrate()`'s algorithm.
- No new npm dependency, no new CSS custom property, anywhere in this plan.
