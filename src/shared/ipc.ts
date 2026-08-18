import type {
  AppState,
  GarmentInput,
  GarmentWithThumb,
  ModelPhotoInput,
  ModelPhotoWithThumb,
  Settings
} from './types'

/**
 * The complete IPC surface. Every channel is listed here once, and both the
 * handler map in main and the contextBridge in preload are typed against it,
 * so an unhandled or misspelled channel is a compile error.
 */
export interface IpcContract {
  'app:getState': () => Promise<AppState>
  'app:reset': () => Promise<void>
  'app:acceptConsent': () => Promise<Settings>

  'settings:update': (patch: Partial<Settings>) => Promise<Settings>

  'credentials:set': (key: string) => Promise<void>
  'credentials:clear': () => Promise<void>
  /** Handed to the renderer at session start only. Never persisted there. */
  'credentials:get': () => Promise<string | null>

  'library:list': () => Promise<GarmentWithThumb[]>
  'library:add': (input: GarmentInput) => Promise<GarmentWithThumb>
  'library:remove': (id: string) => Promise<void>

  /** Photos of the user, which only the still path needs. */
  'models:list': () => Promise<ModelPhotoWithThumb[]>
  'models:add': (input: ModelPhotoInput) => Promise<ModelPhotoWithThumb>
  'models:remove': (id: string) => Promise<void>

  'capture:save': (pngBase64: string) => Promise<string>
  'capture:reveal': (filePath: string) => Promise<void>

  'shell:openCameraPrivacySettings': () => Promise<void>
  'shell:openExternal': (url: string) => Promise<void>
  'dialog:pickCaptureDir': () => Promise<string | null>

  /**
   * Renderer tells main that money moved, for the log. Live sessions bracket
   * themselves with enter/exit; a still is a single billed event.
   */
  'session:log': (event: {
    kind: 'live-enter' | 'live-exit' | 'still'
    seconds?: number
    cost?: number
  }) => Promise<void>
}

export type IpcChannel = keyof IpcContract
