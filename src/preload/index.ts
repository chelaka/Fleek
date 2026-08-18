import { contextBridge, ipcRenderer } from 'electron'
import type { IpcContract } from '@shared/ipc'

/**
 * The only bridge between the renderer and the machine. Every method is a
 * thin, typed pass-through to a channel declared in IpcContract — the
 * renderer gets no filesystem, no node, and no ad-hoc channels.
 */
const invoke =
  <K extends keyof IpcContract>(channel: K) =>
  (...args: Parameters<IpcContract[K]>): ReturnType<IpcContract[K]> =>
    ipcRenderer.invoke(channel, ...args) as ReturnType<IpcContract[K]>

const api = {
  getState: invoke('app:getState'),
  reset: invoke('app:reset'),
  acceptConsent: invoke('app:acceptConsent'),

  updateSettings: invoke('settings:update'),

  setApiKey: invoke('credentials:set'),
  clearApiKey: invoke('credentials:clear'),
  getApiKey: invoke('credentials:get'),

  listGarments: invoke('library:list'),
  addGarment: invoke('library:add'),
  removeGarment: invoke('library:remove'),

  listModelPhotos: invoke('models:list'),
  addModelPhoto: invoke('models:add'),
  removeModelPhoto: invoke('models:remove'),

  saveCapture: invoke('capture:save'),
  revealCapture: invoke('capture:reveal'),

  openCameraPrivacySettings: invoke('shell:openCameraPrivacySettings'),
  openExternal: invoke('shell:openExternal'),
  pickCaptureDir: invoke('dialog:pickCaptureDir'),

  logSession: invoke('session:log')
}

export type FleekApi = typeof api

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('fleek', api)
} else {
  // Only reachable if contextIsolation were ever turned off, which it is not.
  ;(globalThis as unknown as { fleek: FleekApi }).fleek = api
}
