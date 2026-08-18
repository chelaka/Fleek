/** Types shared across main, preload and renderer. */
import type { SlotId } from './slots'

export * from './slots'

export interface Garment {
  id: string
  name: string
  /** What this garment is worn as. Pre-slot libraries default to `top`. */
  slot: SlotId
  createdAt: number
  /** Absolute path of the original image on disk. Electron only. */
  imagePath?: string
  /** Absolute path of the 128px tray thumbnail on disk. Electron only. */
  thumbPath?: string
  /** URL returned by fal.storage.upload() — what the model actually reads. */
  remoteUrl: string
  width: number
  height: number
}

/** A garment plus its thumbnail inlined, which is what the tray renders. */
export interface GarmentWithThumb extends Garment {
  thumbDataUrl: string
}

/**
 * A photo of the user, kept so the still path has someone to dress.
 *
 * The live mirror never needs one -- the webcam feed is the person. FASHN
 * does, which is the one genuinely new thing photo mode introduces: a stored
 * likeness rather than a stream that ends when the session does.
 */
export interface ModelPhoto {
  id: string
  name: string
  createdAt: number
  /** Absolute path of the original image on disk. Electron only. */
  imagePath?: string
  /** Absolute path of the 128px thumbnail on disk. Electron only. */
  thumbPath?: string
  /** URL returned by fal.storage.upload() — what the model actually reads. */
  remoteUrl: string
  width: number
  height: number
}

export interface ModelPhotoWithThumb extends ModelPhoto {
  thumbDataUrl: string
}

export interface ModelPhotoInput {
  name: string
  /** Base64 (no data: prefix) of the original image. */
  imageBase64: string
  /** File extension without the dot: jpg | png | webp */
  imageExt: string
  /** Base64 PNG of the 128px thumbnail. */
  thumbBase64: string
  remoteUrl: string
  width: number
  height: number
}

export interface Settings {
  /** deviceId from enumerateDevices(); empty means "let the OS pick". */
  cameraDeviceId: string
  /** Hard cap on a billing session, in seconds. 60–600. */
  capSeconds: number
  /** Where stills are written. Defaults to Pictures/Fleek. */
  captureDir: string
  /** Empty means use the default substitution prompt. */
  promptOverride: string
  /** ISO timestamp, or empty if consent has not been given. */
  consentAcceptedAt: string
  /** Which stored photo the still path dresses. Empty means none picked yet. */
  modelPhotoId: string
}

export interface AppState {
  settings: Settings
  hasApiKey: boolean
  defaultCaptureDir: string
  appVersion: string
}

export interface GarmentInput {
  name: string
  slot: SlotId
  /** Base64 (no data: prefix) of the original image. */
  imageBase64: string
  /** File extension without the dot: jpg | png | webp */
  imageExt: string
  /** Base64 PNG of the 128px thumbnail. */
  thumbBase64: string
  remoteUrl: string
  width: number
  height: number
}

export const CAP_MIN_SECONDS = 60
export const CAP_MAX_SECONDS = 600
export const DEFAULT_CAP_SECONDS = 180

/** $0.02 per second of live video. The number the whole design bends around. */
export const COST_PER_SECOND = 0.02

/**
 * $0.075 per generated still, per garment. The still path exists because of
 * the ratio between this number and the one above: browsing a dozen garments
 * live costs several dollars, and browsing them as stills costs under one.
 */
export const COST_PER_IMAGE = 0.075

export const FAL_MODEL_ID = 'decart/lucy2-vton/realtime'

/** The still path. Takes one person and one garment, and returns an image. */
export const FASHN_MODEL_ID = 'fal-ai/fashn/tryon/v1.6'

/**
 * Enough photos to cover the poses worth having -- straight on, three
 * quarter, full length -- and few enough that picking one stays a glance
 * rather than a search.
 */
export const MAX_MODEL_PHOTOS = 6

/** Which mirror the primary action drives. */
export type FitMode = 'live' | 'still'

export const DEFAULT_PROMPT =
  'Substitute the current top with the outfit from the reference image, matching its color, material, and fit.'

export const DEFAULT_SETTINGS: Settings = {
  cameraDeviceId: '',
  capSeconds: DEFAULT_CAP_SECONDS,
  captureDir: '',
  promptOverride: '',
  consentAcceptedAt: '',
  modelPhotoId: ''
}

/**
 * Native chrome needs JS colour values before any stylesheet exists.
 * These two must stay in step with --glass-000 and --glass-600 in tokens.css.
 */
export const WINDOW_BACKGROUND = '#FBFCFB' // grid-ok: mirrors --glass-000
export const WINDOW_SYMBOL = '#626E69' // grid-ok: mirrors --glass-600

export const WINDOW_SIZE = { width: 1280, height: 832, minWidth: 960, minHeight: 640 }
export const TITLE_BAR_HEIGHT = 56
