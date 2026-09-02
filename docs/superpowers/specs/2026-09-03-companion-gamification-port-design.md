# Companion Gamification Port (from hachiko-desktop) — Design

Date: 2026-09-03
Status: Approved by user, pending implementation plan

## Summary

Ports the second body of work built in `hachiko-desktop` into this browser
codebase: persistent companion identity (session count, streak), a
milestone celebration on the Session Card, a Pomodoro progress bar on the
Session screen, a new pre-session "Ready" screen, and auto-advance
timers on Clarify/Session Card so a student isn't left needing to tap
through every screen after a session ends. Like the dual-cadence
perception port, this is a transcription of already-built, already-used
logic - the design decisions below restate what was already decided in
`hachiko-desktop`, adapted only where this codebase genuinely differs.

## What ports unchanged

- **Companion state derivation**: a pure function turning the list of
  saved sessions into `{ totalSessions, currentStreakDays, lastSessionAt }`,
  with streak counted as consecutive local-calendar days (today or
  yesterday still counts as "current," a full missed day breaks it).
  Milestones are `sessionCount` at `[1, 5, 10, 25, 50]` and `streak` at
  `[3, 7, 14, 30]`, found by comparing companion state immediately before
  and after saving a session.
- **The greeting is positive-only**: never mentions a broken streak, only
  ever a session count and (once genuinely building) a streak length -
  shown on Framing, the actual "returning student" entry point (Welcome
  only shows once).
- **The milestone celebration is after-session-only**: a soft amber halo
  behind Hachiko plus a one-shot eight-piece confetti burst, shown on the
  Session Card exactly when `findNewMilestone` returns non-null - never
  during a live session, matching the existing "no counter/score/percentage
  during a session" rule untouched by any of this.
- **The Pomodoro progress bar mirrors the existing timer text**, nothing
  more - a visual bar under the countdown, no percentage number, no new
  metric.
- **The Ready screen** is a calm beat between declaring media and the
  timer starting: Hachiko, one line naming the duration, a single "Mulai"
  button. No stats, no promises about outcome.
- **Auto-advance timers** on Clarify (10s) and the Session Card (20s):
  both already treat "no answer"/"no click" as a benign default (skip;
  done), so a visible countdown that quietly does the same thing on
  timeout removes required taps without changing what happens when a
  student doesn't engage.

## What's different in this codebase (the actual porting work)

1. **No `storage/companion.ts` exists yet.** hachiko-desktop built this
   via TDD in its own session; this port carries over the finished
   function bodies and their test suite directly rather than re-deriving
   them, since the underlying logic doesn't depend on anything
   Tauri-specific or browser-specific - it's pure data transformation
   over `SessionRecord[]`, already defined identically in this repo's own
   `src/storage/sessions.ts`.
2. **No Tauri tray icon.** hachiko-desktop's `HachikoView.setState()`
   mirrors every pose change to a native system tray icon via
   `invoke('set_tray_pose', ...)`. This repo has no Tauri, no tray, no
   `@tauri-apps/api` dependency at all - the `'celebrating'` pose addition
   to `hachiko.ts` ports with none of that invoke plumbing, exactly as
   this file already has none of it for its other four poses.
3. **`main.ts`'s flow gains one more step** (Ready, between Media and
   Session) - this repo's `main.ts` is simpler than hachiko-desktop's
   (no `registerActiveCamera`/desktop-lifecycle calls), so the insertion
   is a two-line addition, not a restructure.
4. **Session Card's `renderSessionCard` signature gains a `milestone`
   parameter** - already true in hachiko-desktop; ports directly. This
   repo's `runSession` (in `session.ts`) computes `before`/`after`
   companion state around `saveSession` the same way.

## New/changed files

| File | Change |
|---|---|
| `src/storage/companion.ts` | New: `CompanionState`, `Milestone`, `deriveCompanionState`, `findNewMilestone`, `SESSION_COUNT_MILESTONES`, `STREAK_MILESTONES` |
| `src/storage/companion.test.ts` | New: the same test suite hachiko-desktop already has for this module |
| `src/ui/hachiko.ts` | `HachikoPose` gains `'celebrating'`; new pose markup; no tray/invoke code (none exists in this file to begin with) |
| `src/ui/screens/framing.ts` | Shows the companion greeting (streak chip) when `totalSessions >= 1` |
| `src/ui/screens/sessionCard.ts` | Renders the milestone celebration when non-null; `renderSessionCard` gains a `milestone` parameter; auto-close timer added |
| `src/ui/screens/session.ts` | Computes before/after companion state around `saveSession`, passes `milestone` to `renderSessionCard`; adds the Pomodoro progress bar to the Work screen |
| `src/ui/screens/ready.ts` | New: the pre-session Ready screen |
| `src/ui/screens/clarify.ts` | Auto-skip timer added |
| `src/ui/strings.ts` | New copy for the streak chip, milestone text, Ready screen, and both auto-advance notes |
| `src/main.ts` | Wires `renderReady` into the flow between Media and Session |
| `src/styles/base.css` | New rules: `.streak-chip`, `.celebration*`/`.confetti-piece*`/`@keyframes confetti-*`, `.session__progress*` |

## Testing

`storage/companion.ts` is pure and tested under Node exactly like
`storage/sessions.ts`'s existing `computeMetrics`. Everything else here
is DOM/screen orchestration, the same accepted-untestable-under-Node
category as the rest of `src/ui/screens/`.

## Out of scope (explicit)

Any change to the focus engine, session recording internals beyond
threading `milestone` through, or the perception pipeline. The visual
redesign and multi-cycle Pomodoro looping are separate ports (subsystems
3 and 4), not part of this one - this port's CSS additions are new rules
only, not a restructure of any existing rule.
