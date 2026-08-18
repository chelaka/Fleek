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

    saveCapture: bridge.saveCapture,
    revealCapture: bridge.revealCapture,

    openCameraPrivacySettings: bridge.openCameraPrivacySettings,
    openExternal: bridge.openExternal,
    pickCaptureDir: bridge.pickCaptureDir,

    logSession: bridge.logSession
  }
}
