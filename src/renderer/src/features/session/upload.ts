import { fal } from '@fal-ai/client'
import { describeFalError, logFalError } from './errors'

/**
 * Garment images have to be somewhere the model can read them, so intake
 * uploads once and stores the returned URL alongside the local copy.
 * The upload is not billed; only live video is.
 */
export async function uploadGarmentImage(apiKey: string, file: File | Blob): Promise<string> {
  fal.config({ credentials: apiKey })
  return await fal.storage.upload(file as File)
}

/** A cheap round-trip used by the "Test connection" action in Setup. */
export async function testApiKey(apiKey: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = apiKey.trim()
  if (!trimmed) return { ok: false, message: 'Enter a key first.' }

  try {
    fal.config({ credentials: trimmed })
    // A one-pixel PNG. Uploading it proves the key authenticates without
    // touching an inference endpoint, so the check costs nothing.
    const pixel = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      ),
      (c) => c.charCodeAt(0)
    )
    const blob = new Blob([pixel], { type: 'image/png' })
    await fal.storage.upload(new File([blob], 'fleek-check.png', { type: 'image/png' }))
    return { ok: true }
  } catch (error) {
    // The whole object goes to the console: fal's errors carry a status and a
    // body that its `message` alone throws away, and a check that fails
    // without saying why is worse than no check.
    logFalError('storage.upload (key check)', error)
    return { ok: false, message: describeFalError(error, 'check') }
  }
}
