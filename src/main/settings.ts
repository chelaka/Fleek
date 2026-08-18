import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CAP_MAX_SECONDS,
  CAP_MIN_SECONDS,
  DEFAULT_SETTINGS,
  type Settings
} from '@shared/types'

const file = (): string => join(app.getPath('userData'), 'settings.json')

export function defaultCaptureDir(): string {
  return join(app.getPath('pictures'), 'Fleek')
}

let cache: Settings | null = null

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

function normalise(raw: Partial<Settings>): Settings {
  return {
    cameraDeviceId: typeof raw.cameraDeviceId === 'string' ? raw.cameraDeviceId : '',
    capSeconds: clamp(
      typeof raw.capSeconds === 'number' ? raw.capSeconds : DEFAULT_SETTINGS.capSeconds,
      CAP_MIN_SECONDS,
      CAP_MAX_SECONDS
    ),
    captureDir: typeof raw.captureDir === 'string' && raw.captureDir ? raw.captureDir : defaultCaptureDir(),
    promptOverride: typeof raw.promptOverride === 'string' ? raw.promptOverride : '',
    consentAcceptedAt: typeof raw.consentAcceptedAt === 'string' ? raw.consentAcceptedAt : ''
  }
}

export function getSettings(): Settings {
  if (cache) return cache
  let raw: Partial<Settings> = {}
  if (existsSync(file())) {
    try {
      raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Settings>
    } catch {
      raw = {}
    }
  }
  cache = normalise(raw)
  return cache
}

export function updateSettings(patch: Partial<Settings>): Settings {
  cache = normalise({ ...getSettings(), ...patch })
  writeFileSync(file(), JSON.stringify(cache, null, 2), 'utf8')
  return cache
}

export function resetSettings(): Settings {
  cache = normalise({})
  writeFileSync(file(), JSON.stringify(cache, null, 2), 'utf8')
  return cache
}
