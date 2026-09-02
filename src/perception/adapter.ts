import type { Frame } from '../engine/types'
import type { PerceptionTick } from './camera'

const OBJECT_WINDOW_MS = 1000

/**
 * Bridges perception ticks into the engine's Frame contract. The object
 * detector only runs at ~1fps but Frame.objects means "COCO labels seen
 * within the last 1s" (PRD types), so a detection has to persist across
 * several face-rate ticks rather than only appearing on the tick it fired.
 *
 * The engine is stepped once per face-rate tick (~5fps) - that's the
 * clock the whole state machine (EMA, hysteresis, absence, drowsiness) is
 * timed against.
 */
export class FrameAdapter {
  private lastFace: { faceFound: boolean; yaw: number | null; pitch: number | null; eyeBlink: number | null } = {
    faceFound: false,
    yaw: null,
    pitch: null,
    eyeBlink: null,
  }

  private lastObjects: { t: number; labels: string[] } | null = null

  /** Returns null on a tick that carried no face reading (nothing to step). */
  toFrame(tick: PerceptionTick): Frame | null {
    if (tick.objectLabels) {
      this.lastObjects = { t: tick.timestampMs, labels: tick.objectLabels }
    }

    if (!tick.face) return null

    this.lastFace = {
      faceFound: tick.face.faceFound,
      yaw: tick.face.yaw,
      pitch: tick.face.pitch,
      eyeBlink: tick.face.eyeBlink,
    }

    const objects =
      this.lastObjects && tick.timestampMs - this.lastObjects.t <= OBJECT_WINDOW_MS ? this.lastObjects.labels : []

    return {
      t: tick.timestampMs,
      faceFound: this.lastFace.faceFound,
      yaw: this.lastFace.yaw,
      pitch: this.lastFace.pitch,
      eyeBlink: this.lastFace.eyeBlink,
      objects,
    }
  }

  reset(): void {
    this.lastFace = { faceFound: false, yaw: null, pitch: null, eyeBlink: null }
    this.lastObjects = null
  }
}
