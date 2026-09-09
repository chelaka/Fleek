import type {
  AppState,
  GarmentInput,
  GarmentWithThumb,
  ModelPhotoInput,
  ModelPhotoWithThumb,
  Settings
} from '@shared/types'

/**
 * The single seam between the app and the machine it runs on.
 *
 * Everything above this line -- the mirror, the session machine, the prompt
 * builder, the whole UI -- is identical on desktop and on the web. Everything
 * below it differs: Electron has a filesystem and an OS credential store, a
 * browser has IndexedDB and a download prompt.
 *
 * Method names match the old `window.fleek` bridge exactly, so the desktop
 * adapter is a pass-through and the port was mechanical.
 */
export interface FleekPlatform {
  readonly kind: 'electron' | 'web'

  /**
   * What this host can actually do. The UI hides affordances rather than
   * offering a button that silently does nothing.
   */
  readonly can: {
    /** Choose where stills are written. Browsers decide that themselves. */
    pickCaptureDir: boolean
    /** Show a saved still in a file manager. */
    revealCapture: boolean
    /** Deep-link to the OS camera privacy page. */
    osCameraSettings: boolean
    /** Store the Decart key outside the page's own storage. */
    secureKeyStorage: boolean
  }

  getState(): Promise<AppState>
  reset(): Promise<void>
  acceptConsent(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<Settings>

  setApiKey(key: string): Promise<void>
  clearApiKey(): Promise<void>
  /**
   * Handed out at session start only.
   *
   * On desktop this decrypts from the OS credential store. On the web it is
   * the user's own key from their own browser -- which is why the web build
   * is bring-your-own-key and never ships a key of its own.
   */
  getApiKey(): Promise<string | null>

  listGarments(): Promise<GarmentWithThumb[]>
  addGarment(input: GarmentInput): Promise<GarmentWithThumb>
  removeGarment(id: string): Promise<void>

  /**
   * The full-resolution original, as bytes.
   *
   * Fleek used to upload every garment and keep only the URL, because the old
   * provider read its reference over HTTP. Decart takes the bytes inline, so
   * there is nothing to upload and nothing of the user's wardrobe or likeness
   * sitting on someone else's disk between sessions. The originals live here
   * instead -- on disk under Electron, in IndexedDB in a browser -- and this
   * is how the mirror, the composite sheet and the still path read them back.
   *
   * Throws a sentence if the original is gone.
   */
  getImage(kind: 'garment' | 'photo', id: string): Promise<Blob>

  /** Photos of the user. Only the still path has anyone to dress. */
  listModelPhotos(): Promise<ModelPhotoWithThumb[]>
  addModelPhoto(input: ModelPhotoInput): Promise<ModelPhotoWithThumb>
  removeModelPhoto(id: string): Promise<void>

  /** Returns a human-readable location, which is not always a real path. */
  saveCapture(pngBase64: string): Promise<string>
  revealCapture(filePath: string): Promise<void>

  openCameraPrivacySettings(): Promise<void>
  openExternal(url: string): Promise<void>
  pickCaptureDir(): Promise<string | null>

  logSession(event: {
    kind: 'live-enter' | 'live-exit' | 'still'
    seconds?: number
    cost?: number
  }): Promise<void>
}
