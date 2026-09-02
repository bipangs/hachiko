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
