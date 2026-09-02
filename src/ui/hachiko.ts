import type { FocusState } from '../engine/types'

/**
 * Hachiko, four hand-drawn inline SVG poses (PRD §4, §9; BUILD_PROMPTS
 * P3). Placeholder art in the sense that a real illustrator's work should
 * replace it (PRD §17 open item 1), but it is not a stand-in rectangle -
 * it is the emotional core of the product and has to actually read as a
 * dog waking up. Behind the single `HachikoView` interface below so real
 * artwork swaps in without touching src/ui/screens/session.ts.
 *
 * Every fill is a CSS custom property from tokens.css - no hardcoded hex,
 * same rule as everywhere else in the app.
 */

export type HachikoPose = 'sleeping' | 'stirring' | 'waking' | 'waiting' | 'drowsy'

/**
 * Five FocusState values map onto five poses. UNCERTAIN and TIDAK_HADIR
 * share "waiting" - a curious, unbothered posture - deliberately, since
 * neither state is a verdict the dog should look alarmed about.
 *
 * `stirring` is not driven by FocusState at all - it's a presentation-
 * only foreshadow (see src/ui/pacing.ts's isRawOutOfCone) shown while
 * the engine still reports FOKUS but a possible drift is brewing, so a
 * kid who drifts often and self-corrects gets a soft early cue instead
 * of nothing then a sudden full wake. `stirring` is true only while the
 * caller has independently decided to show it; this function never
 * infers it from state alone.
 */
export function poseForState(state: FocusState, stirring = false): HachikoPose {
  if (state === 'FOKUS' && stirring) return 'stirring'

  switch (state) {
    case 'FOKUS':
      return 'sleeping'
    case 'TERALIH':
      return 'waking'
    case 'MENGANTUK':
      return 'drowsy'
    case 'TIDAK_HADIR':
    case 'UNCERTAIN':
      return 'waiting'
  }
}

const ARIA_LABEL: Record<HachikoPose, string> = {
  sleeping: 'Hachiko sedang tidur',
  stirring: 'Hachiko mulai terusik',
  waking: 'Hachiko terbangun',
  waiting: 'Hachiko menunggu dengan tenang',
  drowsy: 'Hachiko mulai mengantuk',
}

const POSE_MARKUP: Record<HachikoPose, string> = {
  sleeping: `
    <ellipse cx="100" cy="145" rx="58" ry="42" fill="var(--amber)" />
    <circle cx="100" cy="88" r="40" fill="var(--amber)" />
    <path d="M64 62 Q54 30 78 44 Q70 58 64 62 Z" fill="var(--amber-deep)" />
    <path d="M136 62 Q146 30 122 44 Q130 58 136 62 Z" fill="var(--amber-deep)" />
    <path d="M80 92 Q88 98 96 92" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" fill="none" />
    <path d="M104 92 Q112 98 120 92" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" fill="none" />
    <ellipse cx="100" cy="104" rx="6" ry="4" fill="var(--ink)" />
    <path d="M92 114 Q100 119 108 114" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round" fill="none" />
    <g opacity="0.5" stroke="var(--cream)" stroke-width="3.5" stroke-linecap="round">
      <path d="M148 44 h12" />
      <path d="M154 37 h10" />
      <path d="M159 30 h8" />
    </g>
  `,
  stirring: `
    <ellipse cx="100" cy="145" rx="58" ry="42" fill="var(--amber)" />
    <circle cx="100" cy="88" r="40" fill="var(--amber)" />
    <path d="M64 62 Q54 30 78 44 Q70 58 64 62 Z" fill="var(--amber-deep)" />
    <path d="M134 58 Q146 34 124 42 Q128 54 134 58 Z" fill="var(--amber-deep)" />
    <path d="M80 92 Q88 98 96 92" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" fill="none" />
    <circle cx="112" cy="90" r="4" fill="var(--ink)" />
    <ellipse cx="100" cy="104" rx="6" ry="4" fill="var(--ink)" />
    <path d="M92 114 Q100 119 108 114" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round" fill="none" />
  `,
  waking: `
    <ellipse cx="100" cy="145" rx="58" ry="42" fill="var(--amber)" />
    <circle cx="100" cy="88" r="40" fill="var(--amber)" />
    <path d="M70 55 L58 14 L86 46 Z" fill="var(--amber-deep)" />
    <path d="M130 55 L142 14 L114 46 Z" fill="var(--amber-deep)" />
    <circle cx="86" cy="90" r="9" fill="var(--cream)" />
    <circle cx="114" cy="90" r="9" fill="var(--cream)" />
    <circle cx="87" cy="91" r="4.5" fill="var(--ink)" />
    <circle cx="115" cy="91" r="4.5" fill="var(--ink)" />
    <ellipse cx="100" cy="104" rx="6" ry="4" fill="var(--ink)" />
    <ellipse cx="100" cy="119" rx="9" ry="6" fill="var(--ink)" />
  `,
  waiting: `
    <g transform="rotate(-6 100 100)">
      <ellipse cx="100" cy="145" rx="58" ry="42" fill="var(--amber)" />
      <circle cx="100" cy="88" r="40" fill="var(--amber)" />
      <path d="M68 58 L52 24 L84 48 Z" fill="var(--amber-deep)" />
      <path d="M132 60 Q150 50 138 68 Q130 68 132 60 Z" fill="var(--amber-deep)" />
      <circle cx="86" cy="90" r="7" fill="var(--cream)" />
      <circle cx="114" cy="90" r="7" fill="var(--cream)" />
      <circle cx="87" cy="91" r="3.5" fill="var(--ink)" />
      <circle cx="115" cy="91" r="3.5" fill="var(--ink)" />
      <ellipse cx="100" cy="104" rx="6" ry="4" fill="var(--ink)" />
      <path d="M92 116 Q100 113 108 116" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round" fill="none" />
    </g>
  `,
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

/**
 * A small, static, decorative Hachiko for screens before the session
 * starts (welcome, consent) - the mascot otherwise doesn't appear until
 * S6, leaving every onboarding screen as plain text and buttons.
 * `aria-hidden` because this is decoration, not a status readout; the
 * screen's own title and body already carry the meaning for a
 * screen-reader user.
 */
export function mascotPeek(pose: HachikoPose = 'sleeping'): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.className = 'mascot-peek'
  wrap.setAttribute('aria-hidden', 'true')
  const breathClass = pose === 'sleeping' ? ' hachiko-sleep' : ''
  wrap.innerHTML = `
    <svg class="hachiko-pose${breathClass}" viewBox="0 0 200 200" width="100%" height="100%">
      ${POSE_MARKUP[pose]}
    </svg>
  `
  return wrap
}

export class HachikoView {
  readonly element: HTMLDivElement
  private currentPose: HachikoPose | null = null

  constructor() {
    this.element = document.createElement('div')
    this.element.className = 'session__hachiko'
  }

  setState(state: FocusState, stirring = false): void {
    const pose = poseForState(state, stirring)
    if (pose === this.currentPose) return
    this.currentPose = pose
    this.render(pose)
  }

  private render(pose: HachikoPose): void {
    const breathClass = pose === 'sleeping' ? ' hachiko-sleep' : ''
    this.element.innerHTML = `
      <svg class="hachiko-pose hachiko-pose--enter${breathClass}" viewBox="0 0 200 200" width="100%" height="100%"
           role="img" aria-label="${ARIA_LABEL[pose]}">
        ${POSE_MARKUP[pose]}
      </svg>
    `

    // Swapping innerHTML has nothing to interpolate from on its own -
    // the fresh <svg> starts in the --enter state for one frame, then
    // this drops it so base.css's transition on .hachiko-pose actually
    // plays the spring-in rather than jumping straight to rest.
    const svg = this.element.querySelector('svg')
    if (svg) {
      requestAnimationFrame(() => svg.classList.remove('hachiko-pose--enter'))
    }
  }
}
