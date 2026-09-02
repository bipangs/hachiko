import { strings } from '../strings'
import { actions, body, button, cameraDot, el, screen, title } from '../components'
import { startCamera, startPerceptionLoop, type PerceptionLoopHandle } from '../../perception/camera'
import { createFaceLandmarker } from '../../perception/face'
import { createObjectDetector } from '../../perception/objects'
import type { PerceptionBundle } from '../../perception/bundle'

export interface FramingResult {
  bundle: PerceptionBundle
  video: HTMLVideoElement
}

export function renderFraming(root: HTMLElement): Promise<FramingResult> {
  return new Promise((resolve) => {
    const s = strings.framing
    const { root: screenEl, content } = screen()

    const status = body(s.permissionPending)
    const preview = el('div', { class: 'camera-preview' })
    const video = el('video', {})
    const targetBox = el('div', { class: 'camera-preview__target' })
    preview.append(video, targetBox)

    const dot = cameraDot(strings.common.cameraActive)
    dot.style.visibility = 'hidden'

    let bundle: PerceptionBundle | null = null
    let loop: PerceptionLoopHandle | null = null

    const continueBtn = button(
      s.continueLabel,
      () => {
        if (!bundle) return
        loop?.stop()
        root.replaceChildren()
        resolve({ bundle, video })
      },
      { disabled: true },
    )

    content.append(title(s.title), status, preview, actions(continueBtn), dot)
    root.replaceChildren(screenEl)

    void (async () => {
      try {
        const camera = await startCamera(video)
        dot.style.visibility = 'visible'
        status.textContent = s.body

        const [faceLandmarker, objectDetector] = await Promise.all([createFaceLandmarker(), createObjectDetector()])
        bundle = { camera, faceLandmarker, objectDetector }

        loop = startPerceptionLoop(video, faceLandmarker, objectDetector, (tick) => {
          if (tick.face) continueBtn.disabled = !tick.face.faceFound
        })
      } catch (err) {
        status.textContent =
          err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
            ? s.permissionDenied
            : s.permissionError
        console.error(err)
      }
    })()
  })
}
