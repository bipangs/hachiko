import type { FaceLandmarker, ObjectDetector } from '@mediapipe/tasks-vision'
import type { CameraSession } from './camera'

/** Everything downstream screens (calibration, session) need, created once in framing.ts. */
export interface PerceptionBundle {
  camera: CameraSession
  faceLandmarker: FaceLandmarker
  objectDetector: ObjectDetector
}
