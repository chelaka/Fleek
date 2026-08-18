/**
 * One place that turns whatever fal threw into a sentence.
 *
 * The rule from the PRD is "no error codes on screen" -- but that means no
 * *bare* codes. An error that says nothing is worse than one that says too
 * much, so the classified cases get plain language and everything else keeps
 * the server's own words on the end, where they can be read and acted on.
 */

interface Extracted {
  status: number
  /** Whatever the server or the client actually said, joined. */
  raw: string
}

function extract(error: unknown): Extracted {
  const parts: string[] = []
  let status = 0

  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>

    if (typeof e['status'] === 'number') status = e['status']
    else if (typeof e['code'] === 'number') status = e['code']

    const body = e['body']
    if (typeof body === 'string') {
      parts.push(body)
    } else if (typeof body === 'object' && body !== null) {
      const detail = (body as Record<string, unknown>)['detail']
      if (typeof detail === 'string') {
        parts.push(detail)
      } else if (Array.isArray(detail)) {
        parts.push(
          detail
            .map((d) =>
              typeof d === 'object' && d !== null && 'msg' in d
                ? String((d as { msg: unknown }).msg)
                : String(d)
            )
            .join('; ')
        )
      } else {
        parts.push(JSON.stringify(body))
      }
    }

    for (const key of ['detail', 'error', 'reason', 'message'] as const) {
      const value = e[key]
      if (typeof value === 'string' && value && !parts.includes(value)) parts.push(value)
    }
  }

  if (typeof error === 'string') parts.push(error)
  if (error instanceof Error && error.message && !parts.includes(error.message)) {
    parts.push(error.message)
  }

  const raw = parts.filter(Boolean).join(' - ')
  return { status, raw: raw || String(error) }
}

/**
 * @param context what the user was doing, used only in the fallback sentence.
 */
export function describeFalError(error: unknown, context: 'check' | 'session' | 'upload'): string {
  const { status, raw } = extract(error)

  if (status === 401 || status === 403 || /\b401\b|\b403\b|unauthor|forbidden|invalid.*(key|token)|credential/i.test(raw)) {
    return 'fal did not accept the API key. Check it in Settings.'
  }
  if (status === 402 || /\b402\b|balance|insufficient|quota|billing|payment/i.test(raw)) {
    return 'fal accepted the key but the account has no balance. Add credits on fal.ai.'
  }
  if (status === 429 || /\b429\b|rate.?limit|too many requests/i.test(raw)) {
    return 'fal is rate limiting this key. Wait a moment and start again.'
  }
  if (status === 404 || /\b404\b|not found|no such (app|endpoint|model)/i.test(raw)) {
    return 'fal does not recognise that model endpoint. It may have been renamed or retired.'
  }
  if (/failed to fetch|networkerror|load failed|\bcors\b|err_/i.test(raw)) {
    return 'The request never reached fal. ' + raw
  }
  if (/offline|dns|enotfound|econnrefused|timed? ?out/i.test(raw)) {
    return 'Fleek could not reach fal. Check your internet connection.'
  }

  const lead =
    context === 'session'
      ? 'The session could not start.'
      : context === 'upload'
        ? 'That garment could not be uploaded.'
        : 'The check failed.'

  return lead + (status ? ' fal returned ' + status + '.' : '') + (raw ? ' ' + raw : '')
}

/** Everything unexpected is logged whole, because `message` throws away the body. */
export function logFalError(where: string, error: unknown): void {
  console.error('[fleek] ' + where, error)
}
