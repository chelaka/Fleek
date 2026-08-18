import type { FleekApi } from './index'

declare global {
  interface Window {
    fleek: FleekApi
  }
}

export {}
