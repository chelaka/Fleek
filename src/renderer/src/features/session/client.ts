import { createDecartClient, models } from '@decartai/sdk'
import { IMAGE_MODEL_ID, VTON_MODEL_ID } from '@shared/types'
import { describeDecartError, logDecartError } from './errors'

/**
 * The one place a Decart client is built.
 *
 * The key is the user's own -- Fleek ships none and proxies nothing -- so a
 * client is made per call rather than held in a module, and the key is read
 * from the platform at the moment it is needed. That is also why there is no
 * ephemeral-token flow here: token minting needs a server holding a permanent
 * key, and the whole point of this build is that there isn't one.
 */
export function decart(apiKey: string): ReturnType<typeof createDecartClient> {
  return createDecartClient({ apiKey, telemetry: false })
}

/** The live mirror's model, and the camera constraints it wants. */
export const vtonModel = models.realtime(VTON_MODEL_ID)

/** The still path's model. */
export const imageModel = models.image(IMAGE_MODEL_ID)

/**
 * A short-lived key for one live session, with the spend cap attached.
 *
 * This is the one genuinely better thing about the new provider. The cap used
 * to be a `setTimeout` in a browser tab: close the laptop lid at the wrong
 * moment and the only thing standing between the user and an open meter was
 * code that had stopped running. `maxSessionDuration` moves that ceiling to
 * Decart's side, so the session ends at the cap whether or not Fleek is still
 * there to end it. The client-side cap stays as well -- it is what stops the
 * meter *on time* rather than eventually -- but it is no longer the only one.
 *
 * It is not a security boundary. The permanent key is in the page either way;
 * this is about money, not secrecy, and Settings says so plainly.
 */
export async function mintSessionKey(apiKey: string, capSeconds: number): Promise<string> {
  const token = await decart(apiKey).tokens.create({
    // A minute past the cap: long enough that the token never expires out
    // from under a session that is still inside its own limit.
    expiresIn: Math.min(3600, capSeconds + 60),
    allowedModels: [VTON_MODEL_ID],
    allowedOrigins: [window.location.origin],
    constraints: { realtime: { maxSessionDuration: capSeconds } }
  })
  return token.apiKey
}

/**
 * A cheap round-trip used by the "Test connection" action in Setup.
 *
 * Minting a token touches authentication and nothing else: no model runs, so
 * the check is free. The old provider had to upload a one-pixel PNG to prove
 * the same thing.
 */
export async function testApiKey(
  apiKey: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = apiKey.trim()
  if (!trimmed) return { ok: false, message: 'Enter a key first.' }

  try {
    await decart(trimmed).tokens.create({ expiresIn: 60 })
    return { ok: true }
  } catch (error) {
    // The whole object goes to the console: the SDK's errors carry a code and
    // a body that `message` alone throws away, and a check that fails without
    // saying why is worse than no check.
    logDecartError('tokens.create (key check)', error)
    return { ok: false, message: describeDecartError(error, 'check') }
  }
}
