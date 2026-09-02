import { strings } from '../strings'
import { actions, body, button, cameraDot, card, el, screen, title } from '../components'
import { HachikoView } from '../hachiko'
import { BREAK_MS, EXTENSION_MS, STIRRING_RATIO, WORK_MS } from '../sessionConfig'
import { isRawOutOfCone, shouldOfferEarlyBreak, shouldOfferExtension } from '../pacing'
import type { PerceptionBundle } from '../../perception/bundle'
import { startPerceptionLoop } from '../../perception/camera'
import { FrameAdapter } from '../../perception/adapter'
import { FocusEngine } from '../../engine/focusEngine'
import { DEFAULT_CONFIG } from '../../engine/config'
import type { Cone, FocusState, Media } from '../../engine/types'
import { TelemetryRecorder, persistRecording } from '../../storage/telemetry'
import { emptyDurations, saveSession, listSessions, type DistractionSpan, type SessionRecord } from '../../storage/sessions'
import { deriveCompanionState, findNewMilestone, type Milestone } from '../../storage/companion'
import { renderClarify } from './clarify'
import { renderSessionCard } from './sessionCard'

function formatTimer(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const sec = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function newSessionRecord(declaredMedia: Media[]): SessionRecord {
  return {
    id: `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: Date.now(),
    declaredMedia,
    durationsMs: emptyDurations(),
    distractionEvents: [],
    recoveryTimesMs: [],
    uncertainMs: 0,
    firstCollapseAtMs: null,
    clarification: null,
  }
}

interface WorkPhaseResult {
  record: SessionRecord
  telemetryJsonl: string
  endedManually: boolean
}

/**
 * S6 Sesi. No focus counter, no distraction count, no score, no
 * percentage during the session (CLAUDE.md) - just the timer, Hachiko,
 * the state label, and the two controls. Selesai ends the session right
 * now, skipping straight to clarification/the card; the timer reaching
 * zero on its own goes through the break screen first.
 */
function runWorkPhase(
  root: HTMLElement,
  video: HTMLVideoElement,
  bundle: PerceptionBundle,
  cone: Cone,
  declaredMedia: Media[],
): Promise<WorkPhaseResult> {
  return new Promise((resolve) => {
    const s = strings.session
    const { root: screenEl, content } = screen({ night: true })

    const timerEl = el('p', { class: 'session__timer' }, [formatTimer(WORK_MS)])
    const hachiko = new HachikoView()
    const stateLabel = el('p', { class: 'session__state' }, [''])
    const dot = cameraDot(strings.common.cameraActive)

    let paused = false
    const jedaBtn = button(
      s.jeda,
      () => {
        paused = !paused
        jedaBtn.textContent = paused ? strings.common.continueLabel : s.jeda
      },
      { variant: 'secondary' },
    )
    const selesaiBtn = button(s.selesai, () => finishNow(true), { variant: 'secondary' })
    const nudgeSlot = el('div', { class: 'session__nudge' })

    // The session view never shows the live feed (PRD §9: a dot, not the
    // video), but `video` still has to stay attached to the document for
    // requestVideoFrameCallback to keep firing at all - see the same
    // note in media.ts. This is what was missing before: `video` was
    // never appended anywhere in this screen, so it sat fully detached
    // and the perception loop never produced a single tick.
    const hiddenVideo = el('div', { class: 'visually-hidden' }, [video])

    const sessionWrap = el('div', { class: 'session' }, [
      timerEl,
      hachiko.element,
      stateLabel,
      nudgeSlot,
      el('div', { class: 'session__controls' }, [jedaBtn, selesaiBtn]),
      dot,
      hiddenVideo,
    ])
    content.append(sessionWrap)
    root.replaceChildren(screenEl)

    const engine = new FocusEngine(DEFAULT_CONFIG, cone, declaredMedia)
    const adapter = new FrameAdapter()
    const telemetry = new TelemetryRecorder()
    const record = newSessionRecord(declaredMedia)

    let remainingMs = WORK_MS
    let lastFrameT: number | null = null
    let sessionStartT: number | null = null
    let previousState: FocusState | null = null
    let stateEnteredAt = 0
    let openTeralihSpan: DistractionSpan | null = null
    let finished = false

    // Adaptive pacing (ADHD-focused): the app only ever offers, never
    // imposes. See src/ui/pacing.ts for the pure decision functions.
    let rawOutAccumMs = 0
    let offeredEarlyBreak = false
    let extensionOffered = false
    let nudgeVisible: 'earlyBreak' | 'extension' | null = null

    function hideNudge(): void {
      nudgeVisible = null
      nudgeSlot.replaceChildren()
    }

    function showEarlyBreakNudge(): void {
      nudgeVisible = 'earlyBreak'
      const accept = button(s.goToBreak, () => {
        hideNudge()
        finishNow(false)
      })
      const decline = button(s.earlyBreak.decline, hideNudge, { variant: 'secondary' })
      nudgeSlot.replaceChildren(
        card(el('h2', { class: 'card__title' }, [s.earlyBreak.title]), body(s.earlyBreak.body), actions(accept, decline)),
      )
    }

    function showExtensionNudge(): void {
      nudgeVisible = 'extension'
      const accept = button(s.extension.accept, () => {
        hideNudge()
        remainingMs = EXTENSION_MS
      })
      const decline = button(s.goToBreak, () => {
        hideNudge()
        finishNow(false)
      }, { variant: 'secondary' })
      nudgeSlot.replaceChildren(
        card(el('h2', { class: 'card__title' }, [s.extension.title]), body(s.extension.body), actions(accept, decline)),
      )
    }

    const loop = startPerceptionLoop(video, bundle.faceLandmarker, bundle.objectDetector, (tick) => {
      if (paused || finished) return
      const frame = adapter.toFrame(tick)
      if (!frame) return

      if (sessionStartT === null) sessionStartT = frame.t
      const relativeT = frame.t - sessionStartT

      telemetry.record(frame)

      const dt = lastFrameT === null ? 0 : Math.max(0, frame.t - lastFrameT)
      lastFrameT = frame.t

      const out = engine.step(frame)

      if (out.state !== previousState) {
        if (previousState === 'TERALIH' && openTeralihSpan) {
          openTeralihSpan.end = relativeT
          record.distractionEvents.push(openTeralihSpan)
          openTeralihSpan = null
        }
        if (out.state === 'TERALIH') {
          openTeralihSpan = { start: relativeT, end: relativeT }
        }
        if (previousState === 'TERALIH' && out.state === 'FOKUS') {
          record.recoveryTimesMs.push(relativeT - stateEnteredAt)
        }
        if (previousState === 'FOKUS' && out.state === 'TERALIH' && record.firstCollapseAtMs === null) {
          record.firstCollapseAtMs = relativeT
        }
        previousState = out.state
        stateEnteredAt = relativeT
      }

      record.durationsMs[out.state] += dt
      record.uncertainMs = out.uncertainMs

      if (out.state !== 'TIDAK_HADIR') {
        remainingMs = Math.max(0, remainingMs - dt)
      }

      // Independent of the engine's own hysteresis (see pacing.ts) - a
      // soft early foreshadow, not a second decision-maker.
      rawOutAccumMs = isRawOutOfCone(frame, cone) ? rawOutAccumMs + dt : 0
      const stirring = rawOutAccumMs >= STIRRING_RATIO * DEFAULT_CONFIG.toDistractedMs

      timerEl.textContent = formatTimer(remainingMs)
      stateLabel.textContent = s.stateLabels[out.state]
      hachiko.setState(out.state, stirring)

      if (!nudgeVisible) {
        if (
          remainingMs > 0 &&
          !offeredEarlyBreak &&
          shouldOfferEarlyBreak(WORK_MS, remainingMs, record.durationsMs)
        ) {
          offeredEarlyBreak = true
          showEarlyBreakNudge()
        } else if (remainingMs <= 0) {
          if (!extensionOffered && shouldOfferExtension(out.state, relativeT - stateEnteredAt)) {
            extensionOffered = true
            showExtensionNudge()
          } else {
            finishNow(false)
          }
        }
      }
    })

    function finishNow(endedManually: boolean): void {
      if (finished) return
      finished = true
      loop.stop()
      bundle.camera.stop()
      const telemetryJsonl = telemetry.toJsonl()
      persistRecording(record.id, telemetryJsonl)
      root.replaceChildren()
      resolve({ record, telemetryJsonl, endedManually })
    }
  })
}

function renderBreak(root: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const s = strings.session
    const { root: screenEl, content } = screen()

    const countdown = el('p', { class: 'screen__title' }, [formatTimer(BREAK_MS)])
    let remaining = BREAK_MS

    const finish = () => {
      window.clearInterval(interval)
      root.replaceChildren()
      resolve()
    }

    const lanjutBtn = button(strings.common.continueLabel, finish)
    content.append(title(s.breakTitle), body(s.breakBody), countdown, actions(lanjutBtn))
    root.replaceChildren(screenEl)

    const interval = window.setInterval(() => {
      remaining = Math.max(0, remaining - 1000)
      countdown.textContent = formatTimer(remaining)
      if (remaining <= 0) finish()
    }, 1000)
  })
}

export async function runSession(
  root: HTMLElement,
  video: HTMLVideoElement,
  bundle: PerceptionBundle,
  cone: Cone,
  declaredMedia: Media[],
): Promise<void> {
  const { record, telemetryJsonl, endedManually } = await runWorkPhase(root, video, bundle, cone, declaredMedia)

  if (!endedManually) {
    await renderBreak(root)
  }

  if (record.uncertainMs > 0) {
    const answer = await renderClarify(root)
    record.clarification = { answer }
  }

  const now = Date.now()
  const before = deriveCompanionState(listSessions(), now)
  saveSession(record)
  const after = deriveCompanionState(listSessions(), now)
  const milestone: Milestone | null = findNewMilestone(before, after)

  await renderSessionCard(root, record, telemetryJsonl, milestone)
}
