/**
 * Downloads the three faces the design calls for into the renderer's public
 * folder, so the app ships them rather than reaching for a CDN at runtime.
 *
 *   node scripts/fetch-fonts.mjs
 *
 * The files are gitignored; run this once after cloning. If it fails, Fleek
 * still runs -- tokens.css falls back to a serif, Segoe UI and Cascadia Mono.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'renderer', 'public', 'fonts')

/** Variable-font CSS endpoints. A modern UA string gets woff2 back. */
const FACES = [
  {
    file: 'Fraunces.woff2',
    css: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&display=swap'
  },
  {
    file: 'InterTight.woff2',
    css: 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@100..900&display=swap'
  },
  {
    file: 'GeistMono.woff2',
    css: 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&display=swap'
  }
]

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

async function fetchFace({ file, css }) {
  const target = join(OUT, file)
  if (existsSync(target)) {
    console.log('have  ' + file)
    return true
  }

  const sheet = await fetch(css, { headers: { 'User-Agent': UA } })
  if (!sheet.ok) throw new Error('CSS request failed with ' + sheet.status)

  const text = await sheet.text()
  // Prefer the latin subset; it is the last src block Google emits.
  const urls = [...text.matchAll(/url\((https:\/\/[^)]+\.woff2)\)/g)].map((m) => m[1])
  const url = urls[urls.length - 1]
  if (!url) throw new Error('no woff2 URL in the returned CSS')

  const font = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!font.ok) throw new Error('font request failed with ' + font.status)

  writeFileSync(target, Buffer.from(await font.arrayBuffer()))
  console.log('saved ' + file)
  return true
}

mkdirSync(OUT, { recursive: true })

let failures = 0
for (const face of FACES) {
  try {
    await fetchFace(face)
  } catch (error) {
    failures += 1
    console.warn('skip  ' + face.file + ' -- ' + error.message)
  }
}

if (failures > 0) {
  console.warn(
    '\n' + failures + ' face(s) missing. Fleek will fall back to system faces until you rerun this.'
  )
}
