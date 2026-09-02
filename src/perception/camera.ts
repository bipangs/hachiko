import type { FaceLandmarker, ObjectDetector } from '@mediapipe/tasks-vision'
import { readFace, type FaceReading } from './face'
import { detectObjects } from './objects'

export interface CameraSession {
  video: HTMLVideoElement
  stream: MediaStream
  stop: () => void
}

/**
 * getUserMedia at 640x480, front camera. Throws with the raw DOMException
 * on denial/no-device - callers render the Indonesian permission-denied
 * copy (see ui/strings.ts), not this module.
 */
export async function startCamera(video: HTMLVideoElement): Promise<CameraSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    audio: false,
  })

  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play()

  return {
    video,
    stream,
    stop: () => {
      for (const track of stream.getTracks()) track.stop()
      video.srcObject = null
    },
  }
}

export interface PerceptionTick {
  timestampMs: number
  /** null on ticks where the 5fps face clock didn't fire this frame. */
  face: FaceReading | null
  /** null on ticks where the 1fps object clock didn't fire this frame. */
  objectLabels: string[] | null
}

export interface PerceptionLoopHandle {
  stop: () => void
}

/**
 * Drives face inference at ~5fps and object inference at ~1fps off
 * `video.requestVideoFrameCallback()` - NOT `requestAnimationFrame`,
 * which throttles (or stops entirely) when the tab loses focus.
 * BUILD_PROMPTS P1's week-1 gate: background the tab for 60s and confirm
 * this keeps firing. The whole laptop premise depends on it.
 */
export function startPerceptionLoop(
  video: HTMLVideoElement,
  faceLandmarker: FaceLandmarker,
  objectDetector: ObjectDetector,
  onTick: (tick: PerceptionTick) => void,
  faceIntervalMs = 200,
  objectIntervalMs = 1000,
): PerceptionLoopHandle {
  let stopped = false
  let lastFaceT = -Infinity
  let lastObjectT = -Infinity

  const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
    if (stopped) return

    const timestampMs = Math.round(metadata.mediaTime * 1000)

    let face: FaceReading | null = null
    if (timestampMs - lastFaceT >= faceIntervalMs) {
      face = readFace(faceLandmarker, video, timestampMs)
      lastFaceT = timestampMs
    }

    let objectLabels: string[] | null = null
    if (timestampMs - lastObjectT >= objectIntervalMs) {
      objectLabels = detectObjects(objectDetector, video, timestampMs)
      lastObjectT = timestampMs
    }

    if (face || objectLabels) {
      onTick({ timestampMs, face, objectLabels })
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
