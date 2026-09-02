import { strings } from '../strings'
import { actions, body, button, el, screen, title } from '../components'
import { mascotPeek } from '../hachiko'

/**
 * A calm beat between declaring media and the timer actually starting -
 * names the duration, promises nothing about the outcome (no streaks, no
 * scores here either), and hands control to a single button. Keeps
 * `video` attached (same reason as media.ts) so
 * requestVideoFrameCallback doesn't stall while this screen is up.
 */
export function renderReady(root: HTMLElement, video: HTMLVideoElement, workMs: number): Promise<void> {
  return new Promise((resolve) => {
    const s = strings.ready
    const { root: screenEl, content } = screen()
    const minutes = Math.round(workMs / 60_000)

    const startBtn = button(s.continueLabel, () => {
      root.replaceChildren()
      resolve()
    })

    const hiddenVideo = el('div', { class: 'visually-hidden' }, [video])

    content.append(mascotPeek('waiting'), title(s.title(minutes)), body(s.body), actions(startBtn), hiddenVideo)
    root.replaceChildren(screenEl)
  })
}
