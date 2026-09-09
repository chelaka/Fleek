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
  /**
   * Where a library written before the Decart move left the original.
   *
   * Fleek no longer uploads anything: Decart takes the bytes inline, so the
   * full-resolution original stays on this machine and is read back through
   * `platform.getImage`. Entries added under the old fal build have no local
   * copy, only this URL, so it survives as a fallback rather than quietly
   * breaking a library someone already built.
   */
  legacyUrl?: string
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
 * The live mirror never needs one -- the webcam feed is the person. The still
 * path does, which is the one genuinely new thing photo mode introduces: a
 * stored likeness rather than a stream that ends when the session does.
 */
export interface ModelPhoto {
  id: string
  name: string
  createdAt: number
  /** Absolute path of the original image on disk. Electron only. */
  imagePath?: string
  /** Absolute path of the 128px thumbnail on disk. Electron only. */
  thumbPath?: string
  /** See `Garment.legacyUrl`. */
  legacyUrl?: string
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
  /** What size a still comes back at. */
  stillMode: StillMode
  /** Whether stepping in and out of frame starts and stops the mirror. */
  presenceMode: PresenceMode
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
  width: number
  height: number
}

export const CAP_MIN_SECONDS = 60
export const CAP_MAX_SECONDS = 600
export const DEFAULT_CAP_SECONDS = 180

/** $0.02 per second of live video. The number the whole design bends around. */
export const COST_PER_SECOND = 0.02

/**
 * $0.02 per generated still, per garment. The still path exists because of
 * the ratio between this number and the one above: a second of the mirror and
 * a whole photograph cost the same, so browsing is the cheap way to look and
 * the mirror is what you spend on once you have decided.
 */
export const COST_PER_IMAGE = 0.02

/** The live mirror. Repaints the webcam feed over WebRTC, billed per second. */
export const VTON_MODEL_ID = 'lucy-vton-3.5'

/**
 * The still path. A general image editor rather than a try-on model: it takes
 * the person as `data`, the garment as `reference_image`, and a prompt saying
 * what to do with them. That generality is why a still can now wear a cap or
 * a pair of shoes, which the old try-on endpoint could not.
 */
export const IMAGE_MODEL_ID = 'lucy-image-2'

/**
 * Enough photos to cover the poses worth having -- straight on, three
 * quarter, full length -- and few enough that picking one stays a glance
 * rather than a search.
 */
export const MAX_MODEL_PHOTOS = 6

/** Which mirror the primary action drives. */
export type FitMode = 'live' | 'still'

/**
 * What size a still comes back at.
 *
 * The old three-way quality setting existed because the try-on endpoint
 * charged the same for all three, so the trade was seconds and nothing else.
 * Here the trade is real: 480p is quicker and cheaper, 720p is the one worth
 * looking at. Two honest options rather than three shades of the same price.
 */
export type StillMode = '480p' | '720p'

export const STILL_MODES: readonly { id: StillMode; label: string; note: string }[] = [
  { id: '720p', label: 'Full', note: 'The one worth looking at. $0.02 a garment.' },
  { id: '480p', label: 'Draft', note: 'Smaller, quicker and cheaper. For flipping through a lot.' }
] as const

export const DEFAULT_STILL_MODE: StillMode = '720p'

export function isStillMode(value: unknown): value is StillMode {
  return typeof value === 'string' && STILL_MODES.some((mode) => mode.id === value)
}

/**
 * Whether the camera noticing you is allowed to move money.
 *
 * The webcam runs from the moment the app opens and costs nothing; only the
 * mirror is billed. Presence detection decides which edges of that billing
 * the camera gets to drive, and the three answers are genuinely different
 * promises rather than three settings of one dial:
 *
 *   manual   -- the camera never touches billing. Press to start, press to
 *               stop. What Fleek did before any of this existed.
 *   auto     -- stepping into frame starts the mirror and stepping out stops
 *               it. Hands-free, and the only mode where a false positive can
 *               begin spending with nobody there to see it.
 *   autostop -- you press to start, and walking away stops it. Strictly a
 *               safety net: it can end a session but never begin one.
 *
 * Detection is on-device and free; none of this sends a frame anywhere.
 */
export type PresenceMode = 'manual' | 'auto' | 'autostop'

export const PRESENCE_MODES: readonly { id: PresenceMode; label: string; note: string }[] = [
  {
    id: 'manual',
    label: 'Manual',
    note: 'The camera never starts or stops the mirror. You press both.'
  },
  {
    id: 'autostop',
    label: 'Auto-stop',
    note: 'You press start. Walking away stops it, so an empty room is never billed.'
  },
  {
    id: 'auto',
    label: 'Auto',
    note: 'Step into frame and the mirror starts; step away and it stops. This one can begin billing on its own.'
  }
] as const

/** Manual by default: nothing spends money until it is asked to. */
export const DEFAULT_PRESENCE_MODE: PresenceMode = 'manual'

export function isPresenceMode(value: unknown): value is PresenceMode {
  return typeof value === 'string' && PRESENCE_MODES.some((mode) => mode.id === value)
}

/**
 * How long the frame has to stay empty before the mirror gives up on you.
 *
 * Long enough to bend down for a shoe or turn to a window without losing a
 * connection; short enough that walking out of the room is not billed as
 * looking at yourself. Detection is per-frame and jittery, so this is also
 * what keeps a dropped frame from ending a session.
 */
export const PRESENCE_GRACE_SECONDS = 6

/**
 * And how long you have to actually be there before Auto starts spending.
 *
 * Deliberately not symmetric with the grace period. Leaving should be
 * forgiving because the cost of getting it wrong is a dropped session;
 * arriving should be certain, because the cost of getting that wrong is
 * money.
 */
export const PRESENCE_ARRIVE_SECONDS = 1.5

/**
 * The sentence used when nothing is picked, phrased the way the VTON 3.5
 * prompting guide asks for: an action verb, a named region, then the garment.
 */
export const DEFAULT_PROMPT =
  'Substitute the upper body garment with the garment in the reference image, matching its color, ' +
  "pattern, material, and fit. Keep the person's face, hair, hands, and pose unchanged, and keep the " +
  'background and the direction of the light exactly as they are.'

export const DEFAULT_SETTINGS: Settings = {
  cameraDeviceId: '',
  capSeconds: DEFAULT_CAP_SECONDS,
  captureDir: '',
  promptOverride: '',
  consentAcceptedAt: '',
  modelPhotoId: '',
  stillMode: DEFAULT_STILL_MODE,
  presenceMode: DEFAULT_PRESENCE_MODE
}

/**
 * Native chrome needs JS colour values before any stylesheet exists.
 * These two must stay in step with --glass-000 and --glass-600 in tokens.css.
 */
export const WINDOW_BACKGROUND = '#FBFCFB' // grid-ok: mirrors --glass-000
export const WINDOW_SYMBOL = '#626E69' // grid-ok: mirrors --glass-600

export const WINDOW_SIZE = { width: 1280, height: 832, minWidth: 960, minHeight: 640 }
export const TITLE_BAR_HEIGHT = 56
