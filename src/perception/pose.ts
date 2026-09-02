/**
 * Head pose from MediaPipe's facial transformation matrix, per PRD §5.
 *
 * ⚠️ NOT YET VERIFIED ON HARDWARE. PRD §5: "Verify signs empirically. Log
 * all three, move your head deliberately, label by observation. Budget 30
 * minutes. MediaPipe's axis convention has bitten people." This is
 * BUILD_PROMPTS P1's week-1 gate - do it on a real laptop before trusting
 * calibrate.ts or focusEngine.ts's cone math downstream. The engine and
 * calibration only care that yaw/pitch are *radians in a consistent
 * sign convention frame to frame* - if the signs come out flipped or
 * swapped, negate/swap them here, not in the engine.
 */

export interface Pose {
  yaw: number
  pitch: number
  roll: number
}

/**
 * `matrix` is the flat 16-value array from
 * `FaceLandmarkerResult.facialTransformationMatrixes[0].data`. MediaPipe
 * documents this as a column-major 4x4, so element (row, col) sits at
 * index `col * 4 + row`.
 */
export function decomposePose(matrix: ArrayLike<number>): Pose {
  const at = (row: number, col: number): number => matrix[col * 4 + row] as number

  const r00 = at(0, 0)
  const r10 = at(1, 0)
  const r20 = at(2, 0)
  const r21 = at(2, 1)
  const r22 = at(2, 2)

  const pitch = Math.atan2(-r20, Math.hypot(r21, r22))
  const yaw = Math.atan2(r10, r00)
  const roll = Math.atan2(r21, r22)

  return { yaw, pitch, roll }
}

export interface Point2D {
  x: number
  y: number
}

/**
 * Fallback pose proxy from landmark positions alone (PRD §5 fallback),
 * for use only if the transformation matrix is missing. Nose tip (index
 * 1) offset from the eye-corner midpoint (33, 263), normalised by
 * inter-ocular distance.
 *
 * ⚠️ These are unitless ratios, not radians. They are internally
 * consistent (calibrate.ts derives its cone from whatever values it's
 * fed) but `EngineConfig.coneFloorRad` is calibrated in radians - if
 * this fallback is ever the primary pose source, coneFloorRad needs a
 * matching proxy-unit floor instead of 0.209.
 */
export function fallbackPoseProxy(landmarks: readonly Point2D[]): { yawProxy: number; pitchProxy: number } {
  const nose = landmarks[1]
  const leftEye = landmarks[33]
  const rightEye = landmarks[263]

  if (!nose || !leftEye || !rightEye) {
    return { yawProxy: 0, pitchProxy: 0 }
  }

  const midX = (leftEye.x + rightEye.x) / 2
  const midY = (leftEye.y + rightEye.y) / 2
  const interOcular = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y) || 1

  return {
    yawProxy: (nose.x - midX) / interOcular,
    pitchProxy: (nose.y - midY) / interOcular,
  }
}
