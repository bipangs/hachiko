import type { Cone, EngineConfig, Frame } from './types'
// Explicit .ts extension: tools/replay.ts imports this file directly
// under Node's native type-stripping, which needs real, resolvable
// specifiers (see allowImportingTsExtensions in tsconfig.json).
import { DEFAULT_CONFIG } from './config.ts'

/**
 * Turn 15 seconds of "sit like you normally study" frames into a cone the
 * student's head is allowed to move within before it counts as "out of
 * cone." PRD §5:
 *   1. Discard the first 3000ms (settling).
 *   2. Mean and stddev of yaw and pitch over what's left.
 *   3. Tolerance = max(coneSigmaMult * stddev, coneFloorRad) per axis.
 *
 * The floor matters: a very still student would otherwise get an
 * impossibly tight cone and be flagged for breathing.
 */
export function calibrate(frames: Frame[], config: EngineConfig = DEFAULT_CONFIG): Cone {
  if (frames.length === 0) {
    throw new Error('calibrate: no frames provided')
  }

  const startT = frames[0]!.t
  const settled = frames.filter(
    (f) => f.t - startT >= 3000 && f.faceFound && f.yaw !== null && f.pitch !== null,
  )

  if (settled.length === 0) {
    throw new Error('calibrate: no usable frames after discarding the first 3000ms')
  }

  const yaws = settled.map((f) => f.yaw as number)
  const pitches = settled.map((f) => f.pitch as number)

  const yawMid = mean(yaws)
  const pitchMid = mean(pitches)
  const yawTol = Math.max(config.coneSigmaMult * stddev(yaws, yawMid), config.coneFloorRad)
  const pitchTol = Math.max(config.coneSigmaMult * stddev(pitches, pitchMid), config.coneFloorRad)

  return { yawMid, yawTol, pitchMid, pitchTol }
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function stddev(values: number[], m: number): number {
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length
  return Math.sqrt(variance)
}
