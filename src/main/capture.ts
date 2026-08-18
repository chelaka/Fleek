import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSettings } from './settings'

/** Stills are the only thing Fleek ever writes about you. */
export function saveCapture(pngBase64: string): string {
  const dir = getSettings().captureDir
  mkdirSync(dir, { recursive: true })

  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`

  const filePath = join(dir, `fleek-${stamp}.png`)
  writeFileSync(filePath, Buffer.from(pngBase64, 'base64'))
  return filePath
}
