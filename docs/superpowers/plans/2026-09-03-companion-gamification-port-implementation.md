# Companion Gamification Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port hachiko-desktop's companion identity, milestone celebration, session progress bar, Ready screen, and auto-advance UX into this browser codebase.

**Architecture:** A new pure `storage/companion.ts` module (TDD) derives session-count/streak state from saved sessions; screens read it and render accordingly. This is a direct port of already-built, already-used code - tasks give exact final code, not fresh design.

**Tech Stack:** Plain TypeScript, Vitest for the new pure-function tests.

**Spec:** `docs/superpowers/specs/2026-09-03-companion-gamification-port-design.md`

## Global Constraints

- No new npm dependency anywhere in this plan.
- No new CSS custom property - every value reuses a token already in `src/styles/tokens.css`.
- No color anywhere is red.
- `src/engine/` and the focus engine's algorithm are untouched.
- No focus counter, distraction count, score, or percentage is shown during a live session - all gamification here is either after a session ends (Session Card) or before one starts (Framing greeting, Ready screen), never during `runWorkPhase`.
- No Tauri code anywhere - this app has no Tauri dependency and none of this plan introduces one, unlike hachiko-desktop's tray-icon mirroring on the same `HachikoView.setState()` this plan touches.

---

### Task 1: storage/companion.ts (TDD)

**Files:**
- Create: `src/storage/companion.ts`
- Create: `src/storage/companion.test.ts`

**Interfaces:**
- Consumes: `SessionRecord` from `./sessions` (already exists).
- Produces: `CompanionState { totalSessions, currentStreakDays, lastSessionAt }`, `Milestone = { kind: 'sessionCount' | 'streak', value: number }`, `deriveCompanionState(sessions: SessionRecord[], now: number): CompanionState`, `findNewMilestone(before: CompanionState, after: CompanionState): Milestone | null` - Task 2 imports `deriveCompanionState`; Task 3 imports `findNewMilestone` and the `Milestone` type.

- [ ] **Step 1: Write the failing tests**

Create `src/storage/companion.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { deriveCompanionState, findNewMilestone, type CompanionState } from './companion'
import { emptyDurations, type SessionRecord } from './sessions'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-03T12:00:00').getTime()

function sessionAt(startedAt: number): SessionRecord {
  return {
    id: `s-${startedAt}`,
    startedAt,
    declaredMedia: ['laptop'],
    durationsMs: emptyDurations(),
    distractionEvents: [],
    recoveryTimesMs: [],
    uncertainMs: 0,
    firstCollapseAtMs: null,
    clarification: null,
  }
}

function state(overrides: Partial<CompanionState> = {}): CompanionState {
  return { totalSessions: 0, currentStreakDays: 0, lastSessionAt: null, ...overrides }
}

describe('deriveCompanionState', () => {
  test('no sessions yet -> zeroed state', () => {
    const result = deriveCompanionState([], NOW)
    expect(result.totalSessions).toBe(0)
    expect(result.currentStreakDays).toBe(0)
    expect(result.lastSessionAt).toBeNull()
  })

  test('one session today -> streak of 1, lastSessionAt set', () => {
    const result = deriveCompanionState([sessionAt(NOW)], NOW)
    expect(result.totalSessions).toBe(1)
    expect(result.currentStreakDays).toBe(1)
    expect(result.lastSessionAt).toBe(NOW)
  })

  test('three consecutive days ending today -> streak of 3', () => {
    const sessions = [sessionAt(NOW - 2 * DAY), sessionAt(NOW - 1 * DAY), sessionAt(NOW)]
    const result = deriveCompanionState(sessions, NOW)
    expect(result.currentStreakDays).toBe(3)
  })

  test('a session yesterday but none yet today -> streak still counts (not broken yet)', () => {
    const sessions = [sessionAt(NOW - 2 * DAY), sessionAt(NOW - 1 * DAY)]
    const result = deriveCompanionState(sessions, NOW)
    expect(result.currentStreakDays).toBe(2)
  })

  test('a full missed day breaks the streak', () => {
    // Last session was 2 days ago; yesterday and today both have none.
    const sessions = [sessionAt(NOW - 3 * DAY), sessionAt(NOW - 2 * DAY)]
    const result = deriveCompanionState(sessions, NOW)
    expect(result.currentStreakDays).toBe(0)
  })

  test('multiple sessions the same day only count once toward the streak', () => {
    const sessions = [sessionAt(NOW - 60_000), sessionAt(NOW - 30_000), sessionAt(NOW)]
    const result = deriveCompanionState(sessions, NOW)
    expect(result.totalSessions).toBe(3)
    expect(result.currentStreakDays).toBe(1)
  })

  test('lastSessionAt is the most recent session regardless of array order', () => {
    const sessions = [sessionAt(NOW), sessionAt(NOW - 5 * DAY), sessionAt(NOW - 1 * DAY)]
    const result = deriveCompanionState(sessions, NOW)
    expect(result.lastSessionAt).toBe(NOW)
  })
})

describe('findNewMilestone', () => {
  test('crossing the first session-count milestone (1)', () => {
    const before = state({ totalSessions: 0 })
    const after = state({ totalSessions: 1 })
    expect(findNewMilestone(before, after)).toEqual({ kind: 'sessionCount', value: 1 })
  })

  test('crossing the 5th session-count milestone', () => {
    const before = state({ totalSessions: 4 })
    const after = state({ totalSessions: 5 })
    expect(findNewMilestone(before, after)).toEqual({ kind: 'sessionCount', value: 5 })
  })

  test('not crossing any milestone (e.g. 2nd session) -> null', () => {
    const before = state({ totalSessions: 1 })
    const after = state({ totalSessions: 2 })
    expect(findNewMilestone(before, after)).toBeNull()
  })

  test('crossing a streak milestone (3)', () => {
    const before = state({ totalSessions: 3, currentStreakDays: 2 })
    const after = state({ totalSessions: 3, currentStreakDays: 3 })
    expect(findNewMilestone(before, after)).toEqual({ kind: 'streak', value: 3 })
  })

  test('already past every milestone on both sides -> null', () => {
    const before = state({ totalSessions: 100, currentStreakDays: 40 })
    const after = state({ totalSessions: 101, currentStreakDays: 40 })
    expect(findNewMilestone(before, after)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- companion.test`
Expected: FAIL - `./companion` module doesn't exist yet.

- [ ] **Step 3: Implement companion.ts**

Create `src/storage/companion.ts`:

```ts
import type { SessionRecord } from './sessions'

/**
 * A quiet, positive-only picture of how a student has been using
 * HACHIKO over time - never a broken-streak number, only ever how many
 * sessions and how long a streak currently is.
 */
export interface CompanionState {
  totalSessions: number
  currentStreakDays: number
  lastSessionAt: number | null
}

export type Milestone = { kind: 'sessionCount'; value: number } | { kind: 'streak'; value: number }

export const SESSION_COUNT_MILESTONES = [1, 5, 10, 25, 50]
export const STREAK_MILESTONES = [3, 7, 14, 30]

const DAY_MS = 24 * 60 * 60 * 1000

function startOfLocalDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Streak = consecutive local-calendar days with at least one session,
 * counted backward from today. A day with no session yet doesn't break
 * an otherwise-current streak (the student might still show up later
 * today) - only a full missed day does. Concretely: if today has no
 * session, start counting from yesterday instead; if yesterday has none
 * either, the streak is 0.
 */
export function deriveCompanionState(sessions: SessionRecord[], now: number): CompanionState {
  if (sessions.length === 0) {
    return { totalSessions: 0, currentStreakDays: 0, lastSessionAt: null }
  }

  let lastSessionAt = sessions[0]!.startedAt
  const dayKeys = new Set<number>()
  for (const session of sessions) {
    dayKeys.add(startOfLocalDay(session.startedAt))
    if (session.startedAt > lastSessionAt) lastSessionAt = session.startedAt
  }

  let cursor = startOfLocalDay(now)
  if (!dayKeys.has(cursor)) {
    cursor -= DAY_MS
  }
  let streak = 0
  while (dayKeys.has(cursor)) {
    streak += 1
    cursor -= DAY_MS
  }

  return {
    totalSessions: sessions.length,
    currentStreakDays: streak,
    lastSessionAt,
  }
}

/**
 * Compares companion state from immediately before and after saving a
 * session, and returns the one milestone (if any) that was just crossed.
 * Session-count milestones are checked before streak milestones - if a
 * session somehow crosses both at once, the session-count one wins;
 * there is only ever one celebration per session, never two.
 */
export function findNewMilestone(before: CompanionState, after: CompanionState): Milestone | null {
  for (const value of SESSION_COUNT_MILESTONES) {
    if (before.totalSessions < value && after.totalSessions >= value) {
      return { kind: 'sessionCount', value }
    }
  }
  for (const value of STREAK_MILESTONES) {
    if (before.currentStreakDays < value && after.currentStreakDays >= value) {
      return { kind: 'streak', value }
    }
  }
  return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- companion.test`
Expected: PASS, all 12 tests green.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm run typecheck` - expect zero errors.
Run: `npm test` - expect all tests to pass (41 = the existing 29 plus this task's 12 new ones).

- [ ] **Step 6: Commit**

```bash
git add src/storage/companion.ts src/storage/companion.test.ts
git commit -m "Add storage/companion.ts: derive session-count/streak state and detect milestones"
```

---

### Task 2: Streak chip on Framing

**Files:**
- Modify: `src/ui/screens/framing.ts`
- Modify: `src/ui/strings.ts`
- Modify: `src/styles/base.css`

**Interfaces:**
- Consumes: `deriveCompanionState` from `../../storage/companion` (Task 1); `listSessions` from `../../storage/sessions` (already exists).

- [ ] **Step 1: Add the streak-chip strings**

In `src/ui/strings.ts`, find:

```ts
  framing: {
    title: 'Cek posisi duduk',
    body: 'Pastikan wajahmu masuk ke dalam kotak, dan duduk seperti biasanya kamu belajar.',
    permissionPending: 'Meminta izin kamera...',
    permissionDenied:
      'Izin kamera ditolak. HACHIKO butuh kamera untuk memperhatikan posisi dudukmu. Muat ulang halaman dan izinkan aksesnya ya.',
    permissionError: 'Kamera belum bisa diakses. Coba periksa apakah laptop ini punya kamera yang aktif.',
    continueLabel: 'Posisi sudah pas',
  },
```

Replace with:

```ts
  framing: {
    title: 'Cek posisi duduk',
    body: 'Pastikan wajahmu masuk ke dalam kotak, dan duduk seperti biasanya kamu belajar.',
    permissionPending: 'Meminta izin kamera...',
    permissionDenied:
      'Izin kamera ditolak. HACHIKO butuh kamera untuk memperhatikan posisi dudukmu. Muat ulang halaman dan izinkan aksesnya ya.',
    permissionError: 'Kamera belum bisa diakses. Coba periksa apakah laptop ini punya kamera yang aktif.',
    continueLabel: 'Posisi sudah pas',
    companionSessionCount: (n: number) => `Kamu sudah ${n} sesi bareng Hachiko.`,
    companionStreak: (days: number) => ` ${days} hari berturut-turut!`,
  },
```

- [ ] **Step 2: Add the streak chip to framing.ts**

Find:

```ts
import { strings } from '../strings'
import { actions, body, button, cameraDot, el, screen, title } from '../components'
import { startCamera, startPerceptionLoop, type PerceptionLoopHandle } from '../../perception/camera'
import { createFaceLandmarker } from '../../perception/face'
import { createObjectDetector } from '../../perception/objects'
import type { PerceptionBundle } from '../../perception/bundle'

export interface FramingResult {
```

Replace with:

```ts
import { strings } from '../strings'
import { actions, body, button, cameraDot, el, screen, title } from '../components'
import { startCamera, startPerceptionLoop, type PerceptionLoopHandle } from '../../perception/camera'
import { createFaceLandmarker } from '../../perception/face'
import { createObjectDetector } from '../../perception/objects'
import type { PerceptionBundle } from '../../perception/bundle'
import { deriveCompanionState } from '../../storage/companion'
import { listSessions } from '../../storage/sessions'

// Two-tone flame, same "fill from a CSS custom property" rule as every
// Hachiko pose in hachiko.ts - amber, never red, so it reads as warmth
// rather than urgency.
const FLAME_SVG = `
  <svg viewBox="0 0 24 24" width="18" height="18">
    <path d="M12 21c-4.4 0-7-2.8-7-6.5 0-3.2 2-5 3.5-7.5C10 5 10.5 3 12 2c.3 2.5-.5 4-.2 6 .3 2 2.2 2.5 2.2 4.5 0-1.5 1-2 1-3.5 1.5 1.5 3 4 3 6 0 3.7-2.6 6.5-6 6.5Z" fill="var(--amber)" />
    <path d="M12 21c-2.2 0-3.5-1.6-3.5-3.7 0-1.6 1-2.6 1.7-3.8.3.8.2 1.7 1 2.2.1-1 .6-1.4.9-2.2.7 1 1.4 2.2 1.4 3.4 0 2.3-1.3 4.1-1.5 4.1Z" fill="var(--amber-deep)" />
  </svg>
`

/**
 * The same quiet, positive-only "Hachiko remembers you" greeting from
 * the design - a pill chip instead of a bare paragraph. The flame only
 * appears once a streak is genuinely building (>=2 days).
 */
function streakChip(sessionCount: number, streakDays: number): HTMLDivElement {
  const s = strings.framing
  let text = s.companionSessionCount(sessionCount)
  const chip = el('div', { class: 'streak-chip' })
  if (streakDays >= 2) {
    const flame = el('span', { class: 'streak-chip__flame' })
    flame.innerHTML = FLAME_SVG
    chip.append(flame)
    text += s.companionStreak(streakDays)
  }
  chip.append(el('span', {}, [text]))
  return chip
}

export interface FramingResult {
```

Then find:

```ts
    content.append(title(s.title), status, preview, actions(continueBtn), dot)
    root.replaceChildren(screenEl)
```

Replace with:

```ts
    content.append(title(s.title), status, preview, actions(continueBtn), dot)

    // A quiet, positive-only "Hachiko remembers you" note - never
    // mentions a broken streak, only ever a session count and (once
    // genuinely building) a streak. Framing is the real "returning
    // student" entry point (Welcome only shows once), so this is the
    // one place that greeting can land.
    const companion = deriveCompanionState(listSessions(), Date.now())
    if (companion.totalSessions >= 1) {
      content.append(streakChip(companion.totalSessions, companion.currentStreakDays))
    }

    root.replaceChildren(screenEl)
```

- [ ] **Step 3: Add the streak-chip CSS**

In `src/styles/base.css`, find:

```css
.threshold-note {
  font-size: var(--text-sm);
  color: var(--amber-deep);
}

/* ---- Utility ---- */
```

Replace with:

```css
.threshold-note {
  font-size: var(--text-sm);
  color: var(--amber-deep);
}

/* ---- Companion streak chip (Framing greeting) ---- */
.streak-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  align-self: flex-start;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-pill);
  background: var(--sand);
  border: 1px solid var(--cream-border);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--ink);
}

.streak-chip__flame {
  display: inline-flex;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* ---- Utility ---- */
```

- [ ] **Step 4: Typecheck and test**

Run: `npm run typecheck` - expect zero errors.
Run: `npm test` - expect all 41 tests to still pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/framing.ts src/ui/strings.ts src/styles/base.css
git commit -m "Show a companion streak chip on Framing once a student has at least one session"
```

---

### Task 3: Milestone celebration on the Session Card

**Files:**
- Modify: `src/ui/hachiko.ts`
- Modify: `src/ui/screens/sessionCard.ts`
- Modify: `src/ui/screens/session.ts`
- Modify: `src/ui/strings.ts`
- Modify: `src/styles/base.css`

**Interfaces:**
- Consumes: `findNewMilestone`, `Milestone` from `../../storage/companion` (Task 1); `deriveCompanionState` (Task 1, already imported by Task 2 in a different file); `listSessions` from `../../storage/sessions`.
- Produces: `renderSessionCard`'s signature gains a 4th parameter, `milestone: Milestone | null` - no other file besides `session.ts` calls `renderSessionCard`, so this is a closed change.

- [ ] **Step 1: Add the celebrating pose to hachiko.ts**

Find:

```ts
export type HachikoPose = 'sleeping' | 'stirring' | 'waking' | 'waiting' | 'drowsy'
```

Replace with:

```ts
export type HachikoPose = 'sleeping' | 'stirring' | 'waking' | 'waiting' | 'drowsy' | 'celebrating'
```

Find:

```ts
const ARIA_LABEL: Record<HachikoPose, string> = {
  sleeping: 'Hachiko sedang tidur',
  stirring: 'Hachiko mulai terusik',
  waking: 'Hachiko terbangun',
  waiting: 'Hachiko menunggu dengan tenang',
  drowsy: 'Hachiko mulai mengantuk',
}
```

Replace with:

```ts
const ARIA_LABEL: Record<HachikoPose, string> = {
  sleeping: 'Hachiko sedang tidur',
  stirring: 'Hachiko mulai terusik',
  waking: 'Hachiko terbangun',
  waiting: 'Hachiko menunggu dengan tenang',
  drowsy: 'Hachiko mulai mengantuk',
  celebrating: 'Hachiko ikut senang merayakan pencapaianmu',
}
```

Find the end of the `POSE_MARKUP` object - the `drowsy` entry's closing and the object's closing brace:

```ts
  drowsy: `
    <g transform="translate(0 4)">
      <ellipse cx="100" cy="147" rx="58" ry="42" fill="var(--amber)" />
      <circle cx="100" cy="90" r="40" fill="var(--amber)" />
      <path d="M66 70 Q52 48 74 56 Q72 68 66 70 Z" fill="var(--amber-deep)" />
      <path d="M134 70 Q148 48 126 56 Q128 68 134 70 Z" fill="var(--amber-deep)" />
      <path d="M78 92 Q86 97 94 92" stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <path d="M106 92 Q114 97 122 92" stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <ellipse cx="100" cy="106" rx="6" ry="4" fill="var(--ink)" />
      <ellipse cx="100" cy="123" rx="7" ry="9" fill="var(--ink)" opacity="0.85" />
    </g>
  `,
}
```

Replace with:

```ts
  drowsy: `
    <g transform="translate(0 4)">
      <ellipse cx="100" cy="147" rx="58" ry="42" fill="var(--amber)" />
      <circle cx="100" cy="90" r="40" fill="var(--amber)" />
      <path d="M66 70 Q52 48 74 56 Q72 68 66 70 Z" fill="var(--amber-deep)" />
      <path d="M134 70 Q148 48 126 56 Q128 68 134 70 Z" fill="var(--amber-deep)" />
      <path d="M78 92 Q86 97 94 92" stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <path d="M106 92 Q114 97 122 92" stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <ellipse cx="100" cy="106" rx="6" ry="4" fill="var(--ink)" />
      <ellipse cx="100" cy="123" rx="7" ry="9" fill="var(--ink)" opacity="0.85" />
    </g>
  `,
  celebrating: `
    <ellipse cx="100" cy="145" rx="58" ry="42" fill="var(--amber)" />
    <circle cx="100" cy="88" r="40" fill="var(--amber)" />
    <path d="M70 55 L58 14 L86 46 Z" fill="var(--amber-deep)" />
    <path d="M130 55 L142 14 L114 46 Z" fill="var(--amber-deep)" />
    <path d="M78 90 Q86 80 94 90" stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round" fill="none" />
    <path d="M106 90 Q114 80 122 90" stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round" fill="none" />
    <ellipse cx="100" cy="104" rx="6" ry="4" fill="var(--ink)" />
    <path d="M84 114 Q100 132 116 114 Q100 120 84 114 Z" fill="var(--ink)" />
    <g stroke="var(--sage)" stroke-width="3" stroke-linecap="round" opacity="0.85">
      <path d="M46 52 l9 9" />
      <path d="M154 52 l-9 9" />
      <path d="M100 16 v12" />
    </g>
  `,
}
```

Nothing else in `hachiko.ts` changes - `HachikoView.setState()` stays exactly as it is, with no tray-icon mirroring code (this app has none, unlike hachiko-desktop).

- [ ] **Step 2: Add milestone celebration to sessionCard.ts**

Find:

```ts
import { strings, formatMinutes, formatMinSec } from '../strings'
import { actions, body, button, card, el, screen, title } from '../components'
import { computeMetrics, type SessionRecord } from '../../storage/sessions'
import { downloadJsonl } from '../../storage/telemetry'
```

Replace with:

```ts
import { strings, formatMinutes, formatMinSec } from '../strings'
import { actions, body, button, card, el, screen, title } from '../components'
import { computeMetrics, type SessionRecord } from '../../storage/sessions'
import { downloadJsonl } from '../../storage/telemetry'
import { mascotPeek } from '../hachiko'
import type { Milestone } from '../../storage/companion'
```

Find:

```ts
function metric(label: string, value: string): HTMLDivElement {
  return el('div', { class: 'metric' }, [el('span', { class: 'metric__label' }, [label]), el('span', { class: 'metric__value' }, [value])])
}

export function renderSessionCard(root: HTMLElement, record: SessionRecord, telemetryJsonl: string): Promise<void> {
```

Replace with:

```ts
function metric(label: string, value: string): HTMLDivElement {
  return el('div', { class: 'metric' }, [el('span', { class: 'metric__label' }, [label]), el('span', { class: 'metric__value' }, [value])])
}

/** Only ever positive - there is no "you missed a milestone" text, because
 * there's no such thing here, only ones you've reached. */
function milestoneText(milestone: Milestone): string {
  return milestone.kind === 'streak'
    ? strings.sessionCard.milestoneStreak(milestone.value)
    : strings.sessionCard.milestoneSessionCount(milestone.value)
}

/**
 * The milestone moment: a soft amber halo behind Hachiko (reusing the
 * --glow-amber token base.css already defines for exactly this kind of
 * warmth) and a one-shot confetti burst - eight fixed pieces, no
 * randomization or animation loop, colors drawn only from the existing
 * palette. Both animations play once on mount and stop; nothing here
 * loops. Shown only here, after the session ends - never during one.
 */
function celebrationBlock(milestone: Milestone): HTMLDivElement {
  const confetti = el(
    'div',
    { class: 'celebration__confetti', 'aria-hidden': 'true' },
    Array.from({ length: 8 }, (_, i) => el('span', { class: `confetti-piece confetti-piece--${i + 1}` })),
  )
  const mascotWrap = el('div', { class: 'celebration__mascot-wrap' }, [
    el('div', { class: 'celebration__glow', 'aria-hidden': 'true' }),
    confetti,
    mascotPeek('celebrating'),
  ])
  return el('div', { class: 'celebration' }, [mascotWrap, el('p', { class: 'milestone-badge' }, [milestoneText(milestone)])])
}

export function renderSessionCard(
  root: HTMLElement,
  record: SessionRecord,
  telemetryJsonl: string,
  milestone: Milestone | null,
): Promise<void> {
```

Find:

```ts
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
```

Replace with:

```ts
    const doneBtn = button(s.doneLabel, () => {
      root.replaceChildren()
      resolve()
    })

    const celebration: (Node | string)[] = milestone ? [celebrationBlock(milestone)] : []

    content.append(
      title(s.title),
      ...celebration,
      card(...cardChildren),
      body(s.downloadNote),
      actions(downloadBtn, doneBtn),
    )
```

- [ ] **Step 3: Wire milestone computation into session.ts**

Find:

```ts
import { emptyDurations, saveSession, type DistractionSpan, type SessionRecord } from '../../storage/sessions'
import { renderClarify } from './clarify'
import { renderSessionCard } from './sessionCard'
```

Replace with:

```ts
import { emptyDurations, saveSession, listSessions, type DistractionSpan, type SessionRecord } from '../../storage/sessions'
import { deriveCompanionState, findNewMilestone, type Milestone } from '../../storage/companion'
import { renderClarify } from './clarify'
import { renderSessionCard } from './sessionCard'
```

Find:

```ts
  if (record.uncertainMs > 0) {
    const answer = await renderClarify(root)
    record.clarification = { answer }
  }

  saveSession(record)
  await renderSessionCard(root, record, telemetryJsonl)
}
```

Replace with:

```ts
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
```

- [ ] **Step 4: Add the milestone strings**

In `src/ui/strings.ts`, find:

```ts
    downloadLabel: 'Unduh data sesi',
    downloadNote: 'File ini cuma berisi angka (sudut kepala, waktu, label objek), tidak ada gambar sama sekali.',
    doneLabel: 'Selesai',
  },
} as const
```

Replace with:

```ts
    downloadLabel: 'Unduh data sesi',
    downloadNote: 'File ini cuma berisi angka (sudut kepala, waktu, label objek), tidak ada gambar sama sekali.',
    doneLabel: 'Selesai',
    milestoneSessionCount: (n: number) =>
      n === 1 ? 'Sesi pertamamu bareng Hachiko selesai!' : `Sudah ${n} sesi kamu bareng Hachiko!`,
    milestoneStreak: (days: number) => `Wah, ${days} hari berturut-turut!`,
  },
} as const
```

- [ ] **Step 5: Add the celebration/confetti CSS**

In `src/styles/base.css`, find the streak-chip block Task 2 added (now present) and its trailing `/* ---- Utility ---- */` marker:

```css
.streak-chip__flame {
  display: inline-flex;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* ---- Utility ---- */
```

Replace with:

```css
.streak-chip__flame {
  display: inline-flex;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* ---- Milestone celebration (Session Card) ----
   Plays once on mount, then holds still - no looping animation. Shown
   only after a session ends. */
.celebration {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.celebration__mascot-wrap {
  position: relative;
  width: 96px;
  height: 96px;
  align-self: center;
}

.celebration__glow {
  position: absolute;
  inset: -30px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--glow-amber), transparent 70%);
  animation: celebration-glow-in var(--duration-slow) var(--ease-spring);
  pointer-events: none;
}

@keyframes celebration-glow-in {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.milestone-badge {
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--amber-deep);
  background: var(--sand);
  border: 1px solid var(--cream-border);
  border-radius: var(--radius-pill);
  padding: var(--space-2) var(--space-5);
  text-align: center;
}

/* Eight fixed confetti pieces - no randomization, no JS loop. Colors
   drawn only from the existing palette (amber / amber-deep / sage),
   never a new hue. Each piece animates transform + opacity only. */
.celebration__confetti {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  pointer-events: none;
}

.confetti-piece {
  position: absolute;
  top: 0;
  left: 0;
  width: 7px;
  height: 11px;
  border-radius: 2px;
  opacity: 0;
  animation-duration: var(--duration-slow);
  animation-timing-function: var(--ease-standard);
  animation-fill-mode: forwards;
}

.confetti-piece--1 { background: var(--amber); animation-name: confetti-1; }
.confetti-piece--2 { background: var(--sage); animation-name: confetti-2; }
.confetti-piece--3 { background: var(--amber-deep); animation-name: confetti-3; }
.confetti-piece--4 { background: var(--amber); animation-name: confetti-4; }
.confetti-piece--5 { background: var(--sage); animation-name: confetti-5; }
.confetti-piece--6 { background: var(--amber-deep); animation-name: confetti-6; }
.confetti-piece--7 { background: var(--amber); animation-name: confetti-7; }
.confetti-piece--8 { background: var(--sage); animation-name: confetti-8; }

@keyframes confetti-1 {
  from { opacity: 1; transform: translate(-3px, -3px) rotate(0deg); }
  to { opacity: 0; transform: translate(-70px, -50px) rotate(140deg); }
}
@keyframes confetti-2 {
  from { opacity: 1; transform: translate(-3px, -3px) rotate(0deg); }
  to { opacity: 0; transform: translate(-40px, -75px) rotate(-120deg); }
}
@keyframes confetti-3 {
  from { opacity: 1; transform: translate(-3px, -3px) rotate(0deg); }
  to { opacity: 0; transform: translate(0px, -85px) rotate(200deg); }
}
@keyframes confetti-4 {
  from { opacity: 1; transform: translate(-3px, -3px) rotate(0deg); }
  to { opacity: 0; transform: translate(40px, -75px) rotate(-160deg); }
}
@keyframes confetti-5 {
  from { opacity: 1; transform: translate(-3px, -3px) rotate(0deg); }
  to { opacity: 0; transform: translate(70px, -50px) rotate(100deg); }
}
@keyframes confetti-6 {
  from { opacity: 1; transform: translate(-3px, -3px) rotate(0deg); }
  to { opacity: 0; transform: translate(60px, -10px) rotate(-90deg); }
}
@keyframes confetti-7 {
  from { opacity: 1; transform: translate(-3px, -3px) rotate(0deg); }
  to { opacity: 0; transform: translate(-60px, -10px) rotate(180deg); }
}
@keyframes confetti-8 {
  from { opacity: 1; transform: translate(-3px, -3px) rotate(0deg); }
  to { opacity: 0; transform: translate(0px, -20px) rotate(60deg); }
}

/* ---- Utility ---- */
```

- [ ] **Step 6: Typecheck and test**

Run: `npm run typecheck` - expect zero errors.
Run: `npm test` - expect all 41 tests to still pass.

- [ ] **Step 7: Commit**

```bash
git add src/ui/hachiko.ts src/ui/screens/sessionCard.ts src/ui/screens/session.ts src/ui/strings.ts src/styles/base.css
git commit -m "Add milestone celebration (halo + confetti) to the Session Card"
```

---

### Task 4: Pomodoro progress bar on the Work screen

**Files:**
- Modify: `src/ui/screens/session.ts`
- Modify: `src/styles/base.css`

**Interfaces:** none new - purely additive UI inside `runWorkPhase`, no signature changes.

- [ ] **Step 1: Add the progress bar CSS**

In `src/styles/base.css`, find:

```css
.session__timer {
  font-family: var(--font-display);
  font-size: var(--text-timer);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: var(--cream);
}

.session__state {
```

Replace with:

```css
.session__timer {
  font-family: var(--font-display);
  font-size: var(--text-timer);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: var(--cream);
}

/* A visual mirror of the countdown text above it, nothing more - fills
   as remainingMs ticks down, no percentage label, no other metric. */
.session__progress {
  width: 100%;
  max-width: 320px;
  height: 6px;
  align-self: center;
  border-radius: var(--radius-pill);
  background: var(--night-border);
  overflow: hidden;
}

.session__progress-fill {
  width: 0%;
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--amber);
  transition: width var(--duration-fast) linear;
}

.session__state {
```

- [ ] **Step 2: Add the progress bar element and its logic to session.ts**

Find:

```ts
    const timerEl = el('p', { class: 'session__timer' }, [formatTimer(WORK_MS)])
    const hachiko = new HachikoView()
```

Replace with:

```ts
    const timerEl = el('p', { class: 'session__timer' }, [formatTimer(WORK_MS)])
    // A visual mirror of the same time-based countdown the timer text
    // already shows - not a new metric, just another view of it. Never
    // a number of its own (CLAUDE.md: no percentage during the session).
    const progressFill = el('div', { class: 'session__progress-fill' })
    const progressBar = el('div', { class: 'session__progress' }, [progressFill])
    const hachiko = new HachikoView()
```

Find:

```ts
    const sessionWrap = el('div', { class: 'session' }, [
      timerEl,
      hachiko.element,
```

Replace with:

```ts
    const sessionWrap = el('div', { class: 'session' }, [
      timerEl,
      progressBar,
      hachiko.element,
```

Find:

```ts
    let remainingMs = WORK_MS
    let lastFrameT: number | null = null
```

Replace with:

```ts
    let remainingMs = WORK_MS
    // Whichever duration currently governs the countdown - reassigned
    // alongside remainingMs when an extension is accepted, so the
    // progress bar re-baselines against the new total instead of
    // reading as "past 100%".
    let totalMs = WORK_MS
    let lastFrameT: number | null = null
```

Find:

```ts
      const accept = button(s.extension.accept, () => {
        hideNudge()
        remainingMs = EXTENSION_MS
      })
```

Replace with:

```ts
      const accept = button(s.extension.accept, () => {
        hideNudge()
        remainingMs = EXTENSION_MS
        totalMs = EXTENSION_MS
      })
```

Find:

```ts
      timerEl.textContent = formatTimer(remainingMs)
      stateLabel.textContent = s.stateLabels[out.state]
```

Replace with:

```ts
      timerEl.textContent = formatTimer(remainingMs)
      progressFill.style.width = `${Math.min(1, Math.max(0, 1 - remainingMs / totalMs)) * 100}%`
      stateLabel.textContent = s.stateLabels[out.state]
```

- [ ] **Step 3: Typecheck and test**

Run: `npm run typecheck` - expect zero errors.
Run: `npm test` - expect all 41 tests to still pass.

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens/session.ts src/styles/base.css
git commit -m "Add a Pomodoro progress bar to the Work screen, mirroring the existing timer"
```

---

### Task 5: Ready screen

**Files:**
- Create: `src/ui/screens/ready.ts`
- Modify: `src/ui/strings.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces: `renderReady(root: HTMLElement, video: HTMLVideoElement, workMs: number): Promise<void>` - called once from `main.ts`, between `renderMedia` and `runSession`.

- [ ] **Step 1: Add the Ready screen strings**

In `src/ui/strings.ts`, find:

```ts
  session: {
    jeda: 'Jeda',
```

Replace with:

```ts
  ready: {
    title: (minutes: number) => `Siap fokus ${minutes} menit?`,
    body: 'Hachiko bakal nemenin dari sini. Begitu kamu tekan Mulai, sesi langsung berjalan.',
    continueLabel: 'Mulai',
  },

  session: {
    jeda: 'Jeda',
```

- [ ] **Step 2: Create ready.ts**

```ts
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
```

- [ ] **Step 3: Wire it into main.ts**

Find:

```ts
import { renderMedia } from './ui/screens/media'
import { runSession } from './ui/screens/session'
```

Replace with:

```ts
import { renderMedia } from './ui/screens/media'
import { renderReady } from './ui/screens/ready'
import { runSession } from './ui/screens/session'
import { WORK_MS } from './ui/sessionConfig'
```

Find:

```ts
  const { declaredMedia } = await renderMedia(root, video)
  await runSession(root, video, bundle, cone, declaredMedia)
```

Replace with:

```ts
  const { declaredMedia } = await renderMedia(root, video)
  await renderReady(root, video, WORK_MS)
  await runSession(root, video, bundle, cone, declaredMedia)
```

- [ ] **Step 4: Typecheck and test**

Run: `npm run typecheck` - expect zero errors.
Run: `npm test` - expect all 41 tests to still pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/ready.ts src/ui/strings.ts src/main.ts
git commit -m "Add a Ready screen between Media and Session"
```

---

### Task 6: Auto-advance on Clarify and the Session Card

**Files:**
- Modify: `src/ui/screens/clarify.ts`
- Modify: `src/ui/screens/sessionCard.ts`
- Modify: `src/ui/strings.ts`

**Interfaces:** none new - internal timers only, no signature changes.

This task must run after Task 3 (it edits `sessionCard.ts` again, on top of Task 3's changes).

- [ ] **Step 1: Add the auto-advance strings**

In `src/ui/strings.ts`, find:

```ts
    optionSkip: 'Lewati',
  },
```

Replace with:

```ts
    optionSkip: 'Lewati',
    autoSkipNote: (seconds: number) => `Kalau didiamkan, ini otomatis lewat dalam ${seconds} detik.`,
  },
```

Find:

```ts
    milestoneStreak: (days: number) => `Wah, ${days} hari berturut-turut!`,
  },
} as const
```

Replace with:

```ts
    milestoneStreak: (days: number) => `Wah, ${days} hari berturut-turut!`,
    autoCloseNote: (seconds: number) => `Kalau didiamkan, ini otomatis lanjut dalam ${seconds} detik.`,
  },
} as const
```

- [ ] **Step 2: Add the auto-skip timer to clarify.ts**

Replace the full content of `src/ui/screens/clarify.ts`:

```ts
import { strings } from '../strings'
import { actions, body, button, el, screen, title } from '../components'
import type { ClarificationAnswer } from '../../storage/sessions'

// Retunable if the pace feels wrong in practice - not a structural
// constant. Kept short: this is a low-stakes either/or/skip question,
// and "no answer" already resolves to the same benign outcome as Lewati.
const AUTO_SKIP_MS = 10_000

/**
 * The one clarification card per break (PRD §8). Shown only when the
 * caller has already checked there was uncertain time this session; no
 * answer, or "Lewati," leaves those minutes uncertain rather than
 * coercing them into a verdict. Auto-skips after AUTO_SKIP_MS of no
 * interaction, same outcome as tapping Lewati, so a kid who's already
 * mentally moved on isn't stuck here waiting - the countdown is shown,
 * not silent, so nothing jumps unannounced.
 */
export function renderClarify(root: HTMLElement): Promise<ClarificationAnswer | null> {
  return new Promise((resolve) => {
    const s = strings.clarify
    const { root: screenEl, content } = screen()

    let settled = false
    let remainingMs = AUTO_SKIP_MS
    const autoNote = el('p', { class: 'note' }, [s.autoSkipNote(Math.ceil(remainingMs / 1000))])

    const choose = (answer: ClarificationAnswer | null) => {
      if (settled) return
      settled = true
      window.clearInterval(interval)
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
      autoNote,
    )

    root.replaceChildren(screenEl)

    const interval = window.setInterval(() => {
      remainingMs -= 1000
      if (remainingMs <= 0) {
        choose(null)
        return
      }
      autoNote.textContent = s.autoSkipNote(Math.ceil(remainingMs / 1000))
    }, 1000)
  })
}
```

- [ ] **Step 3: Add the auto-close timer to sessionCard.ts**

Find:

```ts
import { mascotPeek } from '../hachiko'
import type { Milestone } from '../../storage/companion'
```

Replace with:

```ts
import { mascotPeek } from '../hachiko'
import type { Milestone } from '../../storage/companion'

// Retunable if the pace feels wrong in practice - not a structural
// constant. Longer than Clarify's since there's more to read here
// (metrics, observation, a possible milestone).
const AUTO_CLOSE_MS = 20_000
```

Find:

```ts
    const downloadBtn = button(s.downloadLabel, () => {
      downloadJsonl(`hachiko-${record.id}.jsonl`, telemetryJsonl)
    }, { variant: 'secondary' })

    const doneBtn = button(s.doneLabel, () => {
      root.replaceChildren()
      resolve()
    })

    const celebration: (Node | string)[] = milestone ? [celebrationBlock(milestone)] : []

    content.append(
      title(s.title),
      ...celebration,
      card(...cardChildren),
      body(s.downloadNote),
      actions(downloadBtn, doneBtn),
    )

    root.replaceChildren(screenEl)
  })
}
```

Replace with:

```ts
    let settled = false
    let remainingMs = AUTO_CLOSE_MS
    const autoNote = el('p', { class: 'note' }, [s.autoCloseNote(Math.ceil(remainingMs / 1000))])

    const finish = () => {
      if (settled) return
      settled = true
      window.clearInterval(interval)
      root.replaceChildren()
      resolve()
    }

    const downloadBtn = button(s.downloadLabel, () => {
      remainingMs = AUTO_CLOSE_MS
      downloadJsonl(`hachiko-${record.id}.jsonl`, telemetryJsonl)
    }, { variant: 'secondary' })

    const doneBtn = button(s.doneLabel, finish)

    const celebration: (Node | string)[] = milestone ? [celebrationBlock(milestone)] : []

    content.append(
      title(s.title),
      ...celebration,
      card(...cardChildren),
      body(s.downloadNote),
      actions(downloadBtn, doneBtn),
      autoNote,
    )

    root.replaceChildren(screenEl)

    const interval = window.setInterval(() => {
      remainingMs -= 1000
      if (remainingMs <= 0) {
        finish()
        return
      }
      autoNote.textContent = s.autoCloseNote(Math.ceil(remainingMs / 1000))
    }, 1000)
  })
}
```

- [ ] **Step 4: Typecheck and test**

Run: `npm run typecheck` - expect zero errors.
Run: `npm test` - expect all 41 tests to still pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/clarify.ts src/ui/screens/sessionCard.ts src/ui/strings.ts
git commit -m "Add auto-advance timers to Clarify and the Session Card"
```

---

## Self-review notes (for the controller, not a task)

- Spec coverage: companion state/milestones (Task 1), streak chip (Task 2), celebration (Task 3), progress bar (Task 4), Ready screen (Task 5), auto-advance (Task 6) - every item in the spec's "New/changed files" table has a task.
- Task 6 depends on Task 3's exact `sessionCard.ts` output (it edits the same file a second time) - task order matters and is fixed in this plan.
- No task touches `src/engine/` or introduces a Tauri dependency.
- No new CSS custom property anywhere - `--glow-amber`, `--sage`, `--night-border`, `--duration-slow`, `--ease-spring`, `--ease-standard`, `--radius-pill` are all already defined in `tokens.css`.
