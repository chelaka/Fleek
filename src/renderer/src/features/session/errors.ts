import type { DecartSDKError } from '@decartai/sdk'

/**
 * One place that turns whatever Decart threw into a sentence.
 *
 * The rule from the PRD is "no error codes on screen" -- but that means no
 * *bare* codes. An error that says nothing is worse than one that says too
 * much, so the classified cases get plain language and everything else keeps
 * the server's own words on the end, where they can be read and acted on.
 *
 * The SDK helps here in a way the old provider did not: a `DecartSDKError`
 * carries a stable `code`, so the common failures are matched on that rather
 * than on a regex over prose that could change under us. The regexes remain
 * for everything that reaches us as a bare fetch failure or a raw response.
 */

interface Extracted {
  status: number
  /** The SDK's own code, when it gave us one. */
  code: string
  /** Whatever the server or the client actually said, joined. */
  raw: string
}

function isSdkError(error: unknown): error is DecartSDKError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  )
}

function extract(error: unknown): Extracted {
  const parts: string[] = []
  let status = 0
  let code = ''

  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>

    if (typeof e['code'] === 'string') code = e['code']
    if (typeof e['status'] === 'number') status = e['status']
    else if (typeof e['code'] === 'number') status = e['code']

    // The SDK hangs the server's response off `data`, and the underlying
    // failure off `cause`. Both say more than `message` alone.
    const data = e['data']
    if (typeof data === 'object' && data !== null) {
      const bag = data as Record<string, unknown>
      if (typeof bag['status'] === 'number') status = bag['status']
      for (const key of ['detail', 'error', 'message'] as const) {
        const value = bag[key]
        if (typeof value === 'string' && value) parts.push(value)
      }
    }

    for (const key of ['detail', 'error', 'reason', 'message'] as const) {
      const value = e[key]
      if (typeof value === 'string' && value && !parts.includes(value)) parts.push(value)
    }

    const cause = e['cause']
    if (cause instanceof Error && cause.message && !parts.includes(cause.message)) {
      parts.push(cause.message)
    }
  }

  if (typeof error === 'string') parts.push(error)
  if (error instanceof Error && error.message && !parts.includes(error.message)) {
    parts.push(error.message)
  }

  const raw = parts.filter(Boolean).join(' - ')
  return { status, code, raw: raw || String(error) }
}

/**
 * @param context what the user was doing, used only in the fallback sentence.
 */
export function describeDecartError(
  error: unknown,
  context: 'check' | 'session' | 'still'
): string {
  const { status, code, raw } = extract(error)

  switch (code) {
    case 'INVALID_API_KEY':
      return 'Decart did not accept the API key. Check it in Settings.'
    case 'MODEL_NOT_FOUND':
      return 'Decart does not recognise that model. It may have been renamed or retired.'
    case 'LIVEKIT_INITIALIZATION_ERROR':
    case 'WEBRTC_WEBSOCKET_ERROR':
    case 'WEBRTC_SIGNALING_ERROR':
    case 'WEBRTC_SERVER_ERROR':
      return 'Fleek could not open a video connection to Decart. Nothing was billed. Try again.'
    case 'WEBRTC_ICE_ERROR':
      return 'The video connection could not get through this network. A VPN or a strict firewall will do this.'
    case 'WEBRTC_TIMEOUT_ERROR':
      return 'Decart did not send a frame back in time. Nothing was billed. Try again.'
    case 'FILES_UPLOAD_ERROR':
      return 'That image would not go through to Decart. Try a smaller one.'
    default:
      break
  }

  if (
    status === 401 ||
    status === 403 ||
    /\b401\b|\b403\b|unauthor|forbidden|invalid.*(key|token)|credential/i.test(raw)
  ) {
    return 'Decart did not accept the API key. Check it in Settings.'
  }
  if (status === 402 || /\b402\b|balance|insufficient|quota|billing|payment|credits/i.test(raw)) {
    return 'Decart accepted the key but the account has no balance. Add credits on decart.ai.'
  }
  if (status === 429 || /\b429\b|rate.?limit|too many requests/i.test(raw)) {
    return 'Decart is rate limiting this key. Wait a moment and start again.'
  }
  if (status === 404 || /\b404\b|not found|no such (app|endpoint|model)/i.test(raw)) {
    return 'Decart does not recognise that model. It may have been renamed or retired.'
  }
  if (/failed to fetch|networkerror|load failed|\bcors\b|err_/i.test(raw)) {
    return 'The request never reached Decart. ' + raw
  }
  if (/offline|dns|enotfound|econnrefused|timed? ?out/i.test(raw)) {
    return 'Fleek could not reach Decart. Check your internet connection.'
  }

  const lead =
    context === 'session'
      ? 'The session could not start.'
      : context === 'still'
        ? 'The image could not be generated.'
        : 'The check failed.'

  return (
    lead +
    (status ? ' Decart returned ' + status + '.' : '') +
    (raw ? ' ' + raw : '')
  )
}

/** Everything unexpected is logged whole, because `message` throws away the rest. */
export function logDecartError(where: string, error: unknown): void {
  console.error('[fleek] ' + where, error)
}

/** True once the SDK has given up reconnecting, which ends the session. */
export function isSdkFailure(error: unknown): error is DecartSDKError {
  return isSdkError(error)
}
