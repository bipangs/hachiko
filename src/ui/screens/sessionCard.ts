import { strings, formatMinutes, formatMinSec } from '../strings'
import { actions, body, button, card, el, screen, title } from '../components'
import { computeMetrics, type SessionRecord } from '../../storage/sessions'
import { downloadJsonl } from '../../storage/telemetry'

/**
 * One plain observation, never a judgment (PRD §8, BUILD_PROMPTS P4).
 * "Fokusmu paling kuat di 12 menit pertama." is right.
 * "Kamu terdistraksi 8 kali." is wrong - this function never counts
 * distractions, only describes where the strong early stretch was.
 */
function observation(firstCollapseAtMs: number | null): string {
  if (firstCollapseAtMs === null) {
    return 'Fokusmu bertahan sepanjang sesi ini.'
  }
  const minutes = Math.max(1, Math.floor(firstCollapseAtMs / 60_000))
  return `Fokusmu paling kuat di ${minutes} menit pertama.`
}

function metric(label: string, value: string): HTMLDivElement {
  return el('div', { class: 'metric' }, [el('span', { class: 'metric__label' }, [label]), el('span', { class: 'metric__value' }, [value])])
}

export function renderSessionCard(root: HTMLElement, record: SessionRecord, telemetryJsonl: string): Promise<void> {
  return new Promise((resolve) => {
    const s = strings.sessionCard
    const { root: screenEl, content } = screen()
    const metrics = computeMetrics(record)

    const totalMinutes = Math.round((metrics.focusMs + metrics.sittingMs + metrics.uncertainMs) / 60_000)
    const focusLine = `${formatMinutes(metrics.focusMs)} dari ${totalMinutes}`

    const metricsGrid = el('div', { class: 'metrics' }, [
      metric(s.focusMinutesLabel, focusLine),
      metric(s.sittingMinutesLabel, `${formatMinutes(metrics.sittingMs)} menit`),
      metric(s.recoveryLabel, metrics.medianRecoveryMs === null ? s.recoveryUnknown : formatMinSec(metrics.medianRecoveryMs)),
      metric(
        s.uncertainLabel,
        `${formatMinutes(metrics.uncertainMs)} menit`,
      ),
    ])

    const cardChildren: (Node | string)[] = [metricsGrid, el('p', { class: 'observation' }, [observation(metrics.firstCollapseAtMs)])]
    if (metrics.exceedsUncertainThreshold) {
      cardChildren.push(el('p', { class: 'threshold-note' }, [s.uncertainThresholdNote]))
    }

    const downloadBtn = button(s.downloadLabel, () => {
      downloadJsonl(`hachiko-${record.id}.jsonl`, telemetryJsonl)
    }, { variant: 'secondary' })

    const doneBtn = button(s.doneLabel, () => {
      root.replaceChildren()
      resolve()
    })

    content.append(
      title(s.title),
      card(...cardChildren),
      body(s.downloadNote),
      actions(downloadBtn, doneBtn),
    )

    root.replaceChildren(screenEl)
  })
}
