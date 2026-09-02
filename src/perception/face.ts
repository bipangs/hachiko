import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { decomposePose } from './pose'

// Self-hosted, never a CDN (CLAUDE.md constraint 2). See tools/copy-wasm.mjs
// and public/models/README.md.
const WASM_BASE = '/wasm'
const MODEL_PATH = '/models/face_landmarker.task'

export interface FaceReading {
  faceFound: boolean
  yaw: number | null // radians
  pitch: number | null // radians
  roll: number | null // radians
  eyeBlink: number | null // 0..1, average of both eyes
  landmarks: NormalizedLandmark[] | null
}

const NOT_FOUND: FaceReading = {
  faceFound: false,
  yaw: null,
  pitch: null,
  roll: null,
  eyeBlink: null,
  landmarks: null,
}

/**
 * Creates the FaceLandmarker per PRD §4: VIDEO mode, GPU delegate, blend
 * shapes and the transformation matrix both on (the matrix feeds pose.ts,
 * the blend shapes feed drowsiness). Falls back to CPU if GPU init
 * throws - some laptops (see PRD §17 "test the worst machine you have")
 * don't have a usable WebGL context for MediaPipe's GPU delegate.
 */
export async function createFaceLandmarker(): Promise<FaceLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE)

  try {
    return await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    })
  } catch (err) {
    console.warn('[hachiko] face landmarker: GPU delegate failed, retrying on CPU', err)
    return FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    })
  }
}

export function readFace(landmarker: FaceLandmarker, video: HTMLVideoElement, timestampMs: number): FaceReading {
  const result = landmarker.detectForVideo(video, timestampMs)
  const landmarks = result.faceLandmarks[0]

  if (!landmarks) return NOT_FOUND

  const matrixData = result.facialTransformationMatrixes[0]?.data
  const pose = matrixData ? decomposePose(matrixData) : null

  return {
    faceFound: true,
    yaw: pose?.yaw ?? null,
    pitch: pose?.pitch ?? null,
    roll: pose?.roll ?? null,
    eyeBlink: averageBlink(result.faceBlendshapes[0]?.categories ?? []),
    landmarks,
  }
}

function averageBlink(categories: { categoryName: string; score: number }[]): number | null {
  const left = categories.find((c) => c.categoryName === 'eyeBlinkLeft')?.score
  const right = categories.find((c) => c.categoryName === 'eyeBlinkRight')?.score
  if (left === undefined || right === undefined) return null
  return (left + right) / 2
}
