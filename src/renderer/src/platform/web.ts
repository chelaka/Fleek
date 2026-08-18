import {
  CAP_MAX_SECONDS,
  CAP_MIN_SECONDS,
  DEFAULT_SETTINGS,
  DEFAULT_SLOT,
  isSlotId,
  type AppState,
  type Garment,
  type GarmentInput,
  type GarmentWithThumb,
  type ModelPhoto,
  type ModelPhotoInput,
  type ModelPhotoWithThumb,
  type Settings
} from '@shared/types'
import { GARMENTS, MODELS, idbClear, idbDelete, idbGetAll, idbPut } from './idb'
import type { FleekPlatform } from './types'

/**
 * The browser adapter.
 *
 * Bring-your-own-key: the fal key is the visitor's own and never leaves their
 * browser, so this build ships no server secret and there is nothing of the
 * operator's to spend. That honesty has a cost -- `localStorage` is readable
 * by any script on this origin -- and the Settings copy says so plainly
 * rather than implying the key is protected.
 */

const KEY_SETTINGS = 'fleek:settings'
const KEY_API = 'fleek:falKey'

/** Browsers choose where downloads land; Fleek only gets to name the file. */
const CAPTURE_LOCATION = 'your downloads folder'

interface StoredGarment extends Garment {
  thumbDataUrl: string
}

interface StoredPhoto extends ModelPhoto {
  thumbDataUrl: string
}

function readSettings(): Settings {
  let raw: Partial<Settings> = {}
  try {
    raw = JSON.parse(localStorage.getItem(KEY_SETTINGS) ?? '{}') as Partial<Settings>
  } catch {
    raw = {}
  }

  const capSeconds =
    typeof raw.capSeconds === 'number'
      ? Math.min(CAP_MAX_SECONDS, Math.max(CAP_MIN_SECONDS, Math.round(raw.capSeconds)))
      : DEFAULT_SETTINGS.capSeconds

  return {
    cameraDeviceId: typeof raw.cameraDeviceId === 'string' ? raw.cameraDeviceId : '',
    capSeconds,
    captureDir: CAPTURE_LOCATION,
    promptOverride: typeof raw.promptOverride === 'string' ? raw.promptOverride : '',
    consentAcceptedAt: typeof raw.consentAcceptedAt === 'string' ? raw.consentAcceptedAt : '',
    modelPhotoId: typeof raw.modelPhotoId === 'string' ? raw.modelPhotoId : ''
  }
}

function writeSettings(settings: Settings): Settings {
  localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings))
  return settings
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

export function createWebPlatform(): FleekPlatform {
  return {
    kind: 'web',
    can: {
      pickCaptureDir: false,
      revealCapture: false,
      osCameraSettings: false,
      // Nothing in a browser can keep a key from the page that holds it.
      secureKeyStorage: false
    },

    async getState(): Promise<AppState> {
      return {
        settings: readSettings(),
        hasApiKey: (localStorage.getItem(KEY_API) ?? '').length > 0,
        defaultCaptureDir: CAPTURE_LOCATION,
        appVersion: __FLEEK_VERSION__
      }
    },

    async reset(): Promise<void> {
      localStorage.removeItem(KEY_SETTINGS)
      localStorage.removeItem(KEY_API)
      await idbClear(GARMENTS)
      await idbClear(MODELS)
    },

    async acceptConsent(): Promise<Settings> {
      return writeSettings({ ...readSettings(), consentAcceptedAt: new Date().toISOString() })
    },

    async updateSettings(patch: Partial<Settings>): Promise<Settings> {
      return writeSettings({ ...readSettings(), ...patch, captureDir: CAPTURE_LOCATION })
    },

    async setApiKey(key: string): Promise<void> {
      const trimmed = key.trim()
      if (trimmed) localStorage.setItem(KEY_API, trimmed)
      else localStorage.removeItem(KEY_API)
    },

    async clearApiKey(): Promise<void> {
      localStorage.removeItem(KEY_API)
    },

    async getApiKey(): Promise<string | null> {
      return localStorage.getItem(KEY_API)
    },

    async listGarments(): Promise<GarmentWithThumb[]> {
      const all = await idbGetAll<StoredGarment>(GARMENTS)
      return all
        .map((g) => (isSlotId(g.slot) ? g : { ...g, slot: DEFAULT_SLOT }))
        .sort((a, b) => b.createdAt - a.createdAt)
    },

    async addGarment(input: GarmentInput): Promise<GarmentWithThumb> {
      const garment: StoredGarment = {
        id: crypto.randomUUID(),
        name: input.name.trim() || 'Garment',
        slot: isSlotId(input.slot) ? input.slot : DEFAULT_SLOT,
        createdAt: Date.now(),
        remoteUrl: input.remoteUrl,
        width: input.width,
        height: input.height,
        thumbDataUrl: 'data:image/png;base64,' + input.thumbBase64
      }
      // The original is not kept: fal already holds it at `remoteUrl`, which
      // is the copy the model actually reads and the composite fetches back.
      await idbPut(GARMENTS, garment)
      return garment
    },

    async removeGarment(id: string): Promise<void> {
      await idbDelete(GARMENTS, id)
    },

    async listModelPhotos(): Promise<ModelPhotoWithThumb[]> {
      const all = await idbGetAll<StoredPhoto>(MODELS)
      return all.sort((a, b) => b.createdAt - a.createdAt)
    },

    async addModelPhoto(input: ModelPhotoInput): Promise<ModelPhotoWithThumb> {
      const photo: StoredPhoto = {
        id: crypto.randomUUID(),
        name: input.name.trim() || 'Photo',
        createdAt: Date.now(),
        remoteUrl: input.remoteUrl,
        width: input.width,
        height: input.height,
        thumbDataUrl: 'data:image/png;base64,' + input.thumbBase64
      }
      // As with garments, the original is not kept here: fal already holds it
      // at `remoteUrl`, which is the copy the model reads.
      await idbPut(MODELS, photo)
      return photo
    },

    async removeModelPhoto(id: string): Promise<void> {
      await idbDelete(MODELS, id)
    },

    async saveCapture(pngBase64: string): Promise<string> {
      const now = new Date()
      const pad = (n: number): string => String(n).padStart(2, '0')
      const name =
        'fleek-' +
        now.getFullYear() +
        '-' +
        pad(now.getMonth() + 1) +
        '-' +
        pad(now.getDate()) +
        '-' +
        pad(now.getHours()) +
        pad(now.getMinutes()) +
        pad(now.getSeconds()) +
        '.png'

      const url = URL.createObjectURL(base64ToBlob(pngBase64, 'image/png'))
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      // Revoking immediately can race the download on some browsers.
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)

      return name
    },

    async revealCapture(): Promise<void> {
      // A browser cannot open a file manager, and `can.revealCapture` is false
      // so the UI never offers it.
    },

    async openCameraPrivacySettings(): Promise<void> {
      // Likewise: browser permissions live in the browser's own UI.
    },

    async openExternal(url: string): Promise<void> {
      if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer')
    },

    async pickCaptureDir(): Promise<string | null> {
      return null
    },

    async logSession(): Promise<void> {
      // There is no disk to write to. The HUD and the summary sentence are
      // the whole record on the web.
    }
  }
}
