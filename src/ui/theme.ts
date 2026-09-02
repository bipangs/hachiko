/**
 * Canvas 2D drawing (landmark dots) can't resolve CSS custom properties
 * the way element styles can - `ctx.fillStyle = 'var(--amber)'` doesn't
 * work. This reads the token's actual value at draw time instead of
 * hardcoding a second copy of the hex in a canvas-drawing module.
 */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
