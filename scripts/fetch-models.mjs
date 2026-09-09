/**
 * Puts the on-device face detector into the renderer's public folder, so the
 * app ships it rather than reaching for a CDN at runtime.
 *
 *   node scripts/fetch-models.mjs
 *
 * Two halves, from two places. The MediaPipe runtime is already on disk in
 * node_modules and is only copied; the model weights are not on npm at all
 * and are fetched once from Google's model store.
 *
 * The files are gitignored; run this once after cloning. If it fails, Fleek
 * still runs -- presence detection reports itself unavailable and the mirror
 * falls back to Manual, which is exactly what it did before any of this
 * existed.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src', 'renderer', 'public', 'vision')
const WASM_OUT = join(OUT, 'wasm')
const WASM_SRC = join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')

/**
 * Both builds are needed, not one: the loader picks the SIMD build where the
 * CPU has it and the nosimd build where it does not, and it decides that at
 * runtime on the user's machine rather than here on ours.
 */
const WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm'
]

/**
 * BlazeFace short-range: built for a face a couple of feet from the lens,
 * which is exactly the webcam case. float16 keeps it under a quarter of a
 * megabyte.
 */
const MODEL = {
  file: 'blaze_face_short_range.tflite',
  url: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
}

mkdirSync(WASM_OUT, { recursive: true })

let failures = 0

for (const file of WASM_FILES) {
  const target = join(WASM_OUT, file)
  try {
    if (existsSync(target)) {
      console.log('have  ' + file)
      continue
    }
    copyFileSync(join(WASM_SRC, file), target)
    console.log('saved ' + file)
  } catch (error) {
    failures += 1
    console.warn('skip  ' + file + ' -- ' + error.message)
  }
}

try {
  const target = join(OUT, MODEL.file)
  if (existsSync(target)) {
    console.log('have  ' + MODEL.file)
  } else {
    const response = await fetch(MODEL.url)
    if (!response.ok) throw new Error('request failed with ' + response.status)
    writeFileSync(target, Buffer.from(await response.arrayBuffer()))
    console.log('saved ' + MODEL.file)
  }
} catch (error) {
  failures += 1
  console.warn('skip  ' + MODEL.file + ' -- ' + error.message)
}

if (failures > 0) {
  console.warn(
    '\n' +
      failures +
      ' file(s) missing. Presence detection will report itself unavailable and the mirror stays on Manual until you rerun this.'
  )
}
