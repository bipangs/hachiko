import type { EngineConfig } from './types'

/**
 * Default engine tuning, from BUILD_PROMPTS.md P2 and PRD §5-§7.
 * `useDeclaredMedia` / `useObjects` toggling off is what powers the
 * A/B/C ablation in tools/replay.ts - see focusEngine.ts.
 */
export const DEFAULT_CONFIG: EngineConfig = {
  emaAlpha: 0.25,
  toDistractedMs: 3000,
  toFocusedMs: 1500,
  absentMs: 5000,
  phoneSustainMs: 15000,
  drowsyThreshold: 0.6,
  drowsyMs: 4000,
  coneSigmaMult: 2.5,
  coneFloorRad: 0.209, // 12 degrees
  useDeclaredMedia: true,
  useObjects: true,
}
