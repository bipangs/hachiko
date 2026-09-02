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

  const onFrame: VideoFrameRequestCallback = () => {
    if (stopped) return

    // Not metadata.mediaTime: re-registering requestVideoFrameCallback on
    // a still-live MediaStream (every screen after Framing does exactly
    // this, reusing the same video/faceLandmarker) can reset or repeat
    // mediaTime values, which breaks MediaPipe's requirement that
    // timestamps fed to a shared FaceLandmarker/ObjectDetector instance
    // always increase - a "Packet timestamp mismatch" thrown from
    // detectForVideo, with no try/catch below, used to silently and
    // permanently freeze whichever screen hit it first (Calibration,
    // stuck at 15s forever). performance.now() is monotonic for the
    // whole page lifetime regardless of how many times this loop is torn
    // down and restarted, and everything downstream (the engine,
    // calibration, session) only ever uses elapsed differences between
    // consecutive timestamps, never an absolute value - so this is a
    // drop-in replacement.
    const timestampMs = Math.round(performance.now())

    // Without this, one thrown error (from either detector) would return
    // before reaching the requestVideoFrameCallback re-registration
    // below, permanently and silently freezing the loop - see above.
    try {
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
    } catch (err) {
      console.error('[hachiko] perception loop', err)
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
