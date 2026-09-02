import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision'

const WASM_BASE = '/wasm'
const MODEL_PATH = '/models/efficientdet_lite0.tflite'

// PRD §4: the four COCO-80 labels that matter for the decision table.
// A tighter allowlist also means less inference work per frame.
const ALLOWLIST = ['cell phone', 'laptop', 'book', 'keyboard']

/**
 * Creates the ObjectDetector per PRD §4: EfficientDet-Lite0, VIDEO mode,
 * GPU delegate with a CPU fallback (see face.ts for why), scoreThreshold
 * 0.4. This is run at 1fps by camera.ts - not optional per PRD §4's
 * "Change 1": it's the only automatic signal that separates a book from
 * a phone held at the same head angle.
 */
export async function createObjectDetector(): Promise<ObjectDetector> {
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE)

  try {
    return await ObjectDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
      runningMode: 'VIDEO',
      scoreThreshold: 0.4,
      categoryAllowlist: ALLOWLIST,
    })
  } catch (err) {
    console.warn('[hachiko] object detector: GPU delegate failed, retrying on CPU', err)
    return ObjectDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' },
      runningMode: 'VIDEO',
      scoreThreshold: 0.4,
      categoryAllowlist: ALLOWLIST,
    })
  }
}

/** Returns the COCO labels detected this frame, above scoreThreshold. */
export function detectObjects(detector: ObjectDetector, video: HTMLVideoElement, timestampMs: number): string[] {
  const result = detector.detectForVideo(video, timestampMs)
  const labels: string[] = []
  for (const detection of result.detections) {
    const label = detection.categories[0]?.categoryName
    if (label) labels.push(label)
  }
  return labels
}
