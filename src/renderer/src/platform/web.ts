import {
  CAP_MAX_SECONDS,
  CAP_MIN_SECONDS,
  DEFAULT_SETTINGS,
  DEFAULT_SLOT,
  DEFAULT_PRESENCE_MODE,
  DEFAULT_STILL_MODE,
  isPresenceMode,
  isSlotId,
  isStillMode,
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
 * Bring-your-own-key: the Decart key is the visitor's own and never leaves their
 * browser, so this build ships no server secret and there is nothing of the
 * operator's to spend. That honesty has a cost -- `localStorage` is readable
 * by any script on this origin -- and the Settings copy says so plainly
 * rather than implying the key is protected.
 */

const KEY_SETTINGS = 'fleek:settings'

/**
 * Deliberately not the old `fleek:falKey`.
 *
 * A key stored under that name is a fal key, and handing a fal key to Decart
 * fails as "the key was not accepted" -- which is true but reads like the
 * user typed it wrong. A new name means an old install is simply asked for a
 * Decart key, which is the actual situation.
 */
const KEY_API = 'fleek:decartKey'

/** Browsers choose where downloads land; Fleek only gets to name the file. */
const CAPTURE_LOCATION = 'your downloads folder'

/**
 * The original is stored as a Blob rather than base64: IndexedDB clones it
 * structurally, so a 2MB photograph costs 2MB instead of the 2.7MB the same
 * bytes would take as a base64 string.
 */
interface StoredGarment extends Garment {
  thumbDataUrl: string
  image?: Blob
}

interface StoredPhoto extends ModelPhoto {
  thumbDataUrl: string
  image?: Blob
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
}

function mimeFor(ext: string): string {
  return MIME[ext.toLowerCase()] ?? 'image/png'
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
    modelPhotoId: typeof raw.modelPhotoId === 'string' ? raw.modelPhotoId : '',
    stillMode: isStillMode(raw.stillMode) ? raw.stillMode : DEFAULT_STILL_MODE,
    presenceMode: isPresenceMode(raw.presenceMode) ? raw.presenceMode : DEFAULT_PRESENCE_MODE
  }
}

function writeSettings(settings: Settings): Settings {
  localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings))
  return settings
}

/**
 * The stored record minus its original.
 *
 * A list of garments is rendered from thumbnails, and handing React a dozen
 * multi-megabyte Blobs it will never read is the kind of thing that only
 * shows up on someone else's machine. `getImage` fetches the one that is
 * actually needed, when it is needed.
 */
function stripImage<T extends { image?: Blob }>(entry: T): Omit<T, 'image'> {
  const { image: _image, ...rest } = entry
  return rest
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
        .map(stripImage)
    },

    async addGarment(input: GarmentInput): Promise<GarmentWithThumb> {
      const garment: StoredGarment = {
        id: crypto.randomUUID(),
        name: input.name.trim() || 'Garment',
        slot: isSlotId(input.slot) ? input.slot : DEFAULT_SLOT,
        createdAt: Date.now(),
        width: input.width,
        height: input.height,
        thumbDataUrl: 'data:image/png;base64,' + input.thumbBase64,
        // The original stays here. It is the copy every model reads, and it
        // never leaves this browser except as bytes on a request.
        image: base64ToBlob(input.imageBase64, mimeFor(input.imageExt))
      }
      await idbPut(GARMENTS, garment)
      return stripImage(garment)
    },

    async removeGarment(id: string): Promise<void> {
      await idbDelete(GARMENTS, id)
    },

    async listModelPhotos(): Promise<ModelPhotoWithThumb[]> {
      const all = await idbGetAll<StoredPhoto>(MODELS)
      return all.sort((a, b) => b.createdAt - a.createdAt).map(stripImage)
    },

    async getImage(kind: 'garment' | 'photo', id: string): Promise<Blob> {
      const store = kind === 'garment' ? GARMENTS : MODELS
      const all = await idbGetAll<StoredGarment | StoredPhoto>(store)
      const entry = all.find((item) => item.id === id)
      if (!entry) throw new Error('That image is no longer in the library.')
      if (entry.image) return entry.image

      // Added under the old fal build, which kept only the upload and wrote
      // it as `remoteUrl`. Those URLs are still public, so a library someone
      // already built keeps working instead of going blank on them.
      const legacy =
        entry.legacyUrl ?? (entry as { remoteUrl?: string }).remoteUrl
      if (legacy) {
        const response = await fetch(legacy)
        if (response.ok) return await response.blob()
      }
      throw new Error(
        'The original for "' + entry.name + '" is missing. Remove it and add the image again.'
      )
    },

    async addModelPhoto(input: ModelPhotoInput): Promise<ModelPhotoWithThumb> {
      const photo: StoredPhoto = {
        id: crypto.randomUUID(),
        name: input.name.trim() || 'Photo',
        createdAt: Date.now(),
        width: input.width,
        height: input.height,
        thumbDataUrl: 'data:image/png;base64,' + input.thumbBase64,
        // A likeness especially: it is uploaded per generation and stored
        // nowhere but here.
        image: base64ToBlob(input.imageBase64, mimeFor(input.imageExt))
      }
      await idbPut(MODELS, photo)
      return stripImage(photo)
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
