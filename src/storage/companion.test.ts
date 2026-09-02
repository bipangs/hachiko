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
