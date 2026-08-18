import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The user brings their own fal key. It is encrypted at rest with the OS
 * credential store via safeStorage and only ever decrypted in main.
 *
 * This is not a secret from its owner — anyone at this Windows login can read
 * it back through the app. That tradeoff is documented in Settings.
 *
 * For now, a `FAL_KEY` environment variable is also accepted as a fallback
 * when nothing is stored, so dev runs don't need to go through Settings.
 */

const file = (): string => join(app.getPath('userData'), 'credentials.bin')

export function hasApiKey(): boolean {
  return existsSync(file()) || Boolean(process.env['FAL_KEY']?.trim())
}

export function setApiKey(key: string): void {
  const trimmed = key.trim()
  if (!trimmed) {
    clearApiKey()
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows is not offering an encryption backend, so the key cannot be stored safely.')
  }
  writeFileSync(file(), safeStorage.encryptString(trimmed))
}

export function getApiKey(): string | null {
  if (!hasApiKey()) return process.env['FAL_KEY']?.trim() || null
  try {
    return safeStorage.decryptString(readFileSync(file()))
  } catch {
    // A corrupt or foreign-machine blob is not recoverable; drop it so the
    // user is asked for the key again instead of hitting an opaque failure.
    clearApiKey()
    return null
  }
}

export function clearApiKey(): void {
  rmSync(file(), { force: true })
}
