// Copies the MediaPipe tasks-vision WASM bundle out of node_modules into
// public/wasm/ so the app can load it from same-origin at runtime instead of
// a CDN (CLAUDE.md constraint 2: no network calls, ever). This only touches
// the local filesystem - no network access required beyond `npm install`
// having already fetched the package.
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const dest = join(root, 'public', 'wasm')

if (!existsSync(src)) {
  console.warn(
    `[copy-wasm] ${src} not found - run "npm install" first. ` +
      'Skipping (this is expected before the first install).',
  )
  process.exit(0)
}

mkdirSync(dest, { recursive: true })

let copied = 0
for (const name of readdirSync(src)) {
  const from = join(src, name)
  if (statSync(from).isFile()) {
    copyFileSync(from, join(dest, name))
    copied += 1
  }
}

console.log(`[copy-wasm] copied ${copied} file(s) into public/wasm/`)
