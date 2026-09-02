/**
 * The week-1 gate from BUILD_PROMPTS P1. Not a product screen - reachable
 * only via `?debug` (see main.ts) - so it can afford a plain readout
 * instead of the calm, sparse language the rest of the app uses. Verify
 * here, by hand, on a real laptop:
 *   1. Landmark dots track your face.
 *   2. Turning your head changes yaw; nodding changes pitch. Write the
 *      signs down (PRD §5).
 *   3. Holding up a phone makes "cell phone" appear within ~2s.
 *   4. Background the tab for 60s, come back - the loop kept running.
 */

// Perception stays independent of src/ui/ - this is a self-contained
// equivalent of ui/theme.ts's cssVar, kept local to this dev-only view.
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export async function mountDebugView(root: HTMLElement): Promise<void> {
  root.innerHTML = ''
  root.className = 'screen'

  const content = document.createElement('div')
  content.className = 'screen__content'
  content.style.maxWidth = '860px'
  root.appendChild(content)

  const title = document.createElement('h1')
  title.className = 'screen__title'
  title.textContent = 'HACHIKO — Debug Perception'
  content.appendChild(title)

  const status = document.createElement('p')
  status.className = 'screen__body'
  status.textContent = 'Meminta izin kamera...'
  content.appendChild(status)

  const previewWrap = document.createElement('div')
  previewWrap.className = 'camera-preview'
  const video = document.createElement('video')
  const canvas = document.createElement('canvas')
  previewWrap.append(video, canvas)
  content.appendChild(previewWrap)

  const readout = document.createElement('pre')
  readout.style.cssText =
    'font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; ' +
    'white-space: pre-wrap; background: var(--sand); border-radius: var(--radius-md); padding: var(--space-4);'
  content.appendChild(readout)

  try {
    const [{ startCamera, startPerceptionLoop }, { createFaceLandmarker }, { createObjectDetector }] =
      await Promise.all([import('./camera'), import('./face'), import('./objects')])

    await startCamera(video)
    status.textContent = 'Kamera aktif. Memuat model...'

    const [faceLandmarker, objectDetector] = await Promise.all([createFaceLandmarker(), createObjectDetector()])
    status.textContent = 'Model siap. Gerakkan kepalamu untuk memverifikasi arah yaw/pitch (lihat PRD §5).'

    const ctx = canvas.getContext('2d')
    let lastLabels: string[] = []

    startPerceptionLoop(video, faceLandmarker, objectDetector, (tick) => {
      if (video.videoWidth && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }

      if (tick.face && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (tick.face.landmarks) {
          ctx.fillStyle = cssVar('--amber')
          for (const lm of tick.face.landmarks) {
            ctx.beginPath()
            ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 1.5, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }

      if (tick.objectLabels) lastLabels = tick.objectLabels

      const f = tick.face
      const toDeg = (r: number | null) => (r === null ? 'null' : `${(r * (180 / Math.PI)).toFixed(1)}°`)
      readout.textContent = [
        `faceFound : ${f ? String(f.faceFound) : '(no face update this tick)'}`,
        `yaw       : ${f ? toDeg(f.yaw) : '-'}`,
        `pitch     : ${f ? toDeg(f.pitch) : '-'}`,
        `roll      : ${f ? toDeg(f.roll) : '-'}`,
        `eyeBlink  : ${f?.eyeBlink !== null && f?.eyeBlink !== undefined ? f.eyeBlink.toFixed(2) : '-'}`,
        `objects (last 1s): ${lastLabels.length ? lastLabels.join(', ') : '(none)'}`,
      ].join('\n')
    })
  } catch (err) {
    status.textContent =
      err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
        ? 'Izin kamera ditolak. Muat ulang halaman dan izinkan akses kamera untuk melanjutkan.'
        : `Perception layer belum bisa jalan: ${err instanceof Error ? err.message : String(err)}`
    console.error(err)
  }
}
