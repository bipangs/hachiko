import { strings } from '../strings'
import { actions, body, button, screen, title } from '../components'
import type { ClarificationAnswer } from '../../storage/sessions'

/**
 * The one clarification card per break (PRD §8). Shown only when the
 * caller has already checked there was uncertain time this session; no
 * answer, or "Lewati," leaves those minutes uncertain rather than
 * coercing them into a verdict.
 */
export function renderClarify(root: HTMLElement): Promise<ClarificationAnswer | null> {
  return new Promise((resolve) => {
    const s = strings.clarify
    const { root: screenEl, content } = screen()

    const choose = (answer: ClarificationAnswer | null) => {
      root.replaceChildren()
      resolve(answer)
    }

    content.append(
      title(s.title),
      body(s.body),
      actions(
        button(s.optionBook, () => choose('book')),
        button(s.optionPhone, () => choose('phone')),
        button(s.optionMixed, () => choose('mixed')),
        button(s.optionSkip, () => choose(null), { variant: 'secondary' }),
      ),
    )

    root.replaceChildren(screenEl)
  })
}
