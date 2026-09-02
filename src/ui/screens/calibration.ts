import { strings } from '../strings'
import { actions, body, button, el, screen, title } from '../components'
import { cssVar } from '../theme'
import { startPerceptionLoop } from '../../perception/camera'
import type { PerceptionBundle } from '../../perception/bundle'
import { calibrate } from '../../engine/calibrate'
import { DEFAULT_CONFIG } from '../../engine/config'
import type { Cone, Frame } from '../../engine/types'

const CALIBRATION_MS = 15_000
const RING_RADIUS = 42
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

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
    let frames: Frame[] = []
    let startT: number | null = null
    let settled = false

    const loop = startPerceptionLoop(video, bundle.faceLandmarker, bundle.objectDetector, (tick) => {
      if (video.videoWidth && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }

      if (tick.face && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (tick.face.landmarks) {
          ctx.fillStyle = cssVar('--amber')
          for (const lm of tick.face.landmarks) {
            ctx.beginPath()
            ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 1.5, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }

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
          loop.stop()
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
    })
  })
}
