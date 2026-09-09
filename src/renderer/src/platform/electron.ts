import type { FleekPlatform } from './types'

/**
 * The desktop adapter. A pass-through to the preload bridge, which is where
 * the real work happens -- safeStorage, the on-disk library, Pictures/Fleek.
 */
export function createElectronPlatform(): FleekPlatform {
  const bridge = window.fleek

  return {
    kind: 'electron',
    can: {
      pickCaptureDir: true,
      revealCapture: true,
      osCameraSettings: true,
      secureKeyStorage: true
    },

    getState: bridge.getState,
    reset: bridge.reset,
    acceptConsent: bridge.acceptConsent,
    updateSettings: bridge.updateSettings,

    setApiKey: bridge.setApiKey,
    clearApiKey: bridge.clearApiKey,
    getApiKey: bridge.getApiKey,

    listGarments: bridge.listGarments,
    addGarment: bridge.addGarment,
    removeGarment: bridge.removeGarment,

    // Bytes cross the bridge as base64, which is all an IPC channel can
    // carry, and become a Blob again here. They go straight to Decart on the
    // next request and are written nowhere else.
    async getImage(kind, id) {
      const binary = atob(await bridge.readImage(kind, id))
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return new Blob([bytes])
    },

    listModelPhotos: bridge.listModelPhotos,
    addModelPhoto: bridge.addModelPhoto,
    removeModelPhoto: bridge.removeModelPhoto,

    saveCapture: bridge.saveCapture,
    revealCapture: bridge.revealCapture,

    openCameraPrivacySettings: bridge.openCameraPrivacySettings,
    openExternal: bridge.openExternal,
    pickCaptureDir: bridge.pickCaptureDir,

    logSession: bridge.logSession
  }
}
