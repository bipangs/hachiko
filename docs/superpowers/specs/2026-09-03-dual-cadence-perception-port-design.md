# Dual-Cadence Perception (Port from hachiko-desktop) — Design

Date: 2026-09-03
Status: Approved by user, pending implementation plan

## Summary

`hachiko-desktop` (a separate Tauri port of this app) already designed,
built, and hardened this exact feature - full spec at that project's
`docs/superpowers/specs/2026-08-29-dual-cadence-perception-design.md`.
This document ports that proven design (and its final, post-review-fixes
code) to this browser codebase, adapting only where the two codebases
genuinely differ. It does not re-derive the architecture from scratch.

**Problem, same as the original:** `src/ui/screens/calibration.ts` drives
one perception loop (`startPerceptionLoop`, `FaceLandmarker` +
`ObjectDetector` at a shared cadence) whose tick callback does double
duty: drawing the live preview overlay (currently: raw landmark dots) and
feeding `calibrate()`'s data collection. Because `FaceLandmarker`'s
inference is synchronous and shares the main thread, the live preview
only visually updates as often as that inference completes - steppy, not
smooth. The port replaces the dot overlay with the same fast, smooth,
velocity-extrapolated circle overlay hachiko-desktop shipped, splitting
"showing the camera responsively" from "collecting calibration data" into
two independently-timed loops.

## What ports unchanged

Every architectural decision from the original spec ports as-is:
- Two independent loops on the same `<video>`, both via
  `requestVideoFrameCallback`: a fast, unthrottled loop (new
  `FaceDetector`, every frame) owning canvas drawing + the
  velocity-extrapolated circle overlay, and the existing slow loop
  (`FaceLandmarker`, throttled) owning only `calibrate()`'s data
  collection.
- The BlazeFace short-range model, the exact same extrapolation math
  (including the fix from the original's own final review: once a gap
  since the last real reading exceeds `EXTRAPOLATION_CAP_MS`, the
  overlay holds exactly at the last known point rather than still
  projecting a fixed distance forward), and the exact same
  `SMOOTHING = 0.35` constant.
- The error-containment and monotonic-timestamp-guard hardening
  `startFaceBoxLoop` needs (also proven necessary for the *existing*
  `startPerceptionLoop` here - already applied in this repo as of commit
  `3666684`, fixing the calibration-freeze bug reported before this port
  began).

## What's different in this codebase (the actual porting work)

1. **Overlay starting point.** hachiko-desktop's calibration screen had
   already evolved through several rounds of overlay design (dots →
   circle → smoothed circle) before dual-cadence was built on top of it.
   This codebase's calibration screen never went through those - it
   still draws raw landmark dots. The port goes straight to the final,
   most-evolved state (smoothed circle + vignette), skipping the
   intermediate dot/circle-without-smoothing stages entirely, since
   that's the actual reference implementation being ported.
2. **Model provenance.** hachiko-desktop commits model binaries directly
   to its repo (its own documented convention). This repo's convention is
   the opposite - models are gitignored and downloaded once, locally, per
   `public/models/README.md` (see that file's existing two entries). The
   new BlazeFace model gets a third entry in that same README, with the
   same download-instructions pattern, not committed to git. It also
   needs to be added to `tools/fetch-assets.mjs` (this repo's own
   build-time asset-fetcher, added when this project was made deployable)
   so a fresh CI/deploy checkout still gets a working camera screen.
3. **No Tauri surface.** hachiko-desktop's `startFaceBoxLoop`/`faceBox.ts`
   never touched anything Tauri-specific in the first place (pure
   browser APIs: `requestVideoFrameCallback`, `FaceDetector`,
   `performance.now()`), so nothing needs stripping out here - the port
   is a straight copy of that logic.
4. **Framing screen's perception interval.** hachiko-desktop separately
   reduced Framing's `startPerceptionLoop` call to a 1000ms face interval
   (from the default 200ms) as part of the same overall "camera preview
   lagging" investigation this whole feature line addresses - `detectForVideo`
   running synchronously at the default rate was visible as periodic
   main-thread stutter even without an overlay to speak of. This port
   includes that same one-argument change to Framing for the same reason;
   Calibration's own slow loop already uses 1000ms in both codebases.

## New/changed files

| File | Change |
|---|---|
| `public/models/README.md` | Document the new `blaze_face_short_range.tflite` model (source, size, download command), matching the existing two entries' format |
| `tools/fetch-assets.mjs` | Add the BlazeFace model to the `ASSETS` list (`required: true`) |
| `src/perception/faceBox.ts` | New: `createFaceDetector()`, `readFaceBox()`, `FaceBox` type - identical to hachiko-desktop's final version |
| `src/perception/camera.ts` | New: `startFaceBoxLoop()` alongside the existing (already-hardened) `startPerceptionLoop()` |
| `src/perception/bundle.ts` | `PerceptionBundle` gains `faceDetector: FaceDetector` |
| `src/ui/screens/framing.ts` | Creates the `FaceDetector` alongside the existing two models; reduces its own perception-loop face interval to 1000ms |
| `src/ui/screens/calibration.ts` | Restructured: canvas drawing (now the circle/vignette overlay, not landmark dots) moves from the slow loop's tick into a new `startFaceBoxLoop` callback; the slow loop keeps only data-collection and countdown/ring duties |

## Coordinate handling, extrapolation, error handling, testing

Identical to the original spec - see
`hachiko-desktop/docs/superpowers/specs/2026-08-29-dual-cadence-perception-design.md`
sections "Coordinate handling", "Extrapolation (Approach A)", and "Error
handling" for the full reasoning. Testing posture is also identical: no
new automated tests (perception/camera code, untestable under Node, same
category as the rest of `src/perception/`); manual verification on a real
browser with a webcam.

## Out of scope (explicit)

Any change to `calibrate()`'s own algorithm, the Session screen's
detection cadence, or object detection. Any Web Worker migration. Any of
the other three desktop features being ported separately (gamification,
visual redesign, multi-cycle Pomodoro) - this port is scoped to
perception/calibration only.
