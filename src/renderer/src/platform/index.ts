import { createElectronPlatform } from './electron'
import { createWebPlatform } from './web'
import type { FleekPlatform } from './types'

export type { FleekPlatform } from './types'

/**
 * One codebase, two hosts. The preload bridge only exists inside Electron, so
 * its presence is the whole detection: no build flag, no environment guess.
 */
export const platform: FleekPlatform =
  typeof window !== 'undefined' && 'fleek' in window ? createElectronPlatform() : createWebPlatform()

export const isWeb = platform.kind === 'web'
