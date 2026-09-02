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
