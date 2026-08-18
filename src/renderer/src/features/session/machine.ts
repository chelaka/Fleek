import { COST_PER_SECOND } from '@shared/types'

/**
 * The spine of the app.
 *
 * A pure, side-effect-free state machine. It owns the answer to the only
 * question that costs money -- "are we billing right now?" -- and nothing
 * else in the app is allowed to have an opinion about it.
 *
 *   idle
 *     -> start()          requesting    (uploading garment ref, signalling)
 *                         negotiating   (ICE servers, offer/answer)
 *                         live          (frames flowing, meter running)
 *                           - swapping  (new garment sent mid-session)
 *                           - degraded  (frame rate drop or ICE restart)
 *                           - stop() / cap reached -> closing -> idle
 *     -> any state -> failed(reason) -> idle
 */

export type SessionStatus =
  | 'idle'
  | 'requesting'
  | 'negotiating'
  | 'live'
  | 'swapping'
  | 'degraded'
  | 'closing'
  | 'failed'

export type EndReason = 'user' | 'cap' | 'failed'

export interface SessionSummary {
  reason: EndReason
  /** Seconds actually billed. */
  seconds: number
  cost: number
  /** A sentence the UI can render. Never an error code. */
  message: string
}

export interface SessionState {
  status: SessionStatus
  /** Epoch ms at which the current billing span began; null when not billing. */
  liveSince: number | null
  /** Billed milliseconds from spans that have already closed this session. */
  accumulatedMs: number
  /** The garment the model is currently wearing, or being asked to wear. */
  garmentId: string | null
  capSeconds: number
  /** Set only in `failed`; always a sentence. */
  failure: string | null
  /** Survives into `idle` so the mirror can say how the last session ended. */
  last: SessionSummary | null
}

export type SessionEvent =
  | { type: 'START'; garmentId: string; capSeconds: number; at: number }
  | { type: 'NEGOTIATING'; at: number }
  /** The model's first frame. The meter starts here and nowhere else. */
  | { type: 'GENERATION_STARTED'; at: number }
  | { type: 'SWAP_REQUESTED'; garmentId: string; at: number }
  | { type: 'SWAP_APPLIED'; at: number }
  | { type: 'DEGRADED'; at: number }
  | { type: 'RECOVERED'; at: number }
  | { type: 'STOP'; at: number }
  | { type: 'CAP_REACHED'; at: number }
  | { type: 'FAIL'; reason: string; at: number }
  | { type: 'CLOSED'; at: number }

/** The states in which fal is charging us: `live` and its two branches. */
const BILLING: ReadonlySet<SessionStatus> = new Set<SessionStatus>([
  'live',
  'swapping',
  'degraded'
])

export function isBilling(status: SessionStatus): boolean {
  return BILLING.has(status)
}

/** True from start() until teardown finishes -- i.e. a connection exists. */
export function isActive(status: SessionStatus): boolean {
  return status !== 'idle' && status !== 'failed'
}

export const initialSession: SessionState = {
  status: 'idle',
  liveSince: null,
  accumulatedMs: 0,
  garmentId: null,
  capSeconds: 180,
  failure: null,
  last: null
}

export function billedMs(state: SessionState, now: number): number {
  return state.accumulatedMs + (state.liveSince === null ? 0 : Math.max(0, now - state.liveSince))
}

export function billedSeconds(state: SessionState, now: number): number {
  return billedMs(state, now) / 1000
}

export function costOf(seconds: number): number {
  return seconds * COST_PER_SECOND
}

/** 0 to 1 progress toward the hard cap. Clamped. */
export function capProgress(state: SessionState, now: number): number {
  if (state.capSeconds <= 0) return 0
  return Math.min(1, billedSeconds(state, now) / state.capSeconds)
}

export function isCapReached(state: SessionState, now: number): boolean {
  return isBilling(state.status) && billedSeconds(state, now) >= state.capSeconds
}

function closeBillingSpan(state: SessionState, at: number): SessionState {
  if (state.liveSince === null) return state
  return {
    ...state,
    accumulatedMs: state.accumulatedMs + Math.max(0, at - state.liveSince),
    liveSince: null
  }
}

function formatCapMessage(capSeconds: number, cost: number): string {
  const minutes = capSeconds / 60
  const label =
    Number.isInteger(minutes) && minutes >= 1
      ? minutes + '-minute'
      : Math.round(capSeconds) + '-second'
  return 'Session ended at your ' + label + ' limit. Total: $' + cost.toFixed(2) + '.'
}

function summarise(
  state: SessionState,
  reason: EndReason,
  at: number,
  failure?: string
): SessionSummary {
  const seconds = billedMs(state, at) / 1000
  const cost = costOf(seconds)
  const message =
    reason === 'cap'
      ? formatCapMessage(state.capSeconds, cost)
      : reason === 'failed'
        ? (failure ?? 'The session stopped.') + ' Billed $' + cost.toFixed(2) + '.'
        : 'Session ended. Total: $' + cost.toFixed(2) + '.'
  return { reason, seconds, cost, message }
}

/**
 * Every transition. Anything not listed is ignored -- an out-of-order event
 * from a socket must never be able to move the machine somewhere absurd, and
 * in particular must never start the meter.
 */
export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'START': {
      if (state.status !== 'idle') return state
      return {
        ...initialSession,
        status: 'requesting',
        garmentId: event.garmentId,
        capSeconds: event.capSeconds,
        last: null
      }
    }

    case 'NEGOTIATING': {
      if (state.status !== 'requesting') return state
      return { ...state, status: 'negotiating' }
    }

    case 'GENERATION_STARTED': {
      // The first frame after connecting starts the meter. The same event
      // after a swap or a recovery just returns us to plain `live`.
      if (state.status === 'requesting' || state.status === 'negotiating') {
        return { ...state, status: 'live', liveSince: event.at }
      }
      if (state.status === 'swapping' || state.status === 'degraded') {
        return { ...state, status: 'live' }
      }
      return state
    }

    case 'SWAP_REQUESTED': {
      // Swaps happen inside `live`. The peer connection is never torn down to
      // change clothes, so billing neither pauses nor restarts.
      if (state.status !== 'live' && state.status !== 'degraded') return state
      return { ...state, status: 'swapping', garmentId: event.garmentId }
    }

    case 'SWAP_APPLIED': {
      if (state.status !== 'swapping') return state
      return { ...state, status: 'live' }
    }

    case 'DEGRADED': {
      if (state.status !== 'live' && state.status !== 'swapping') return state
      return { ...state, status: 'degraded' }
    }

    case 'RECOVERED': {
      if (state.status !== 'degraded') return state
      return { ...state, status: 'live' }
    }

    case 'STOP': {
      if (!isActive(state.status) || state.status === 'closing') return state
      const closed = closeBillingSpan(state, event.at)
      return { ...closed, status: 'closing', last: summarise(state, 'user', event.at) }
    }

    case 'CAP_REACHED': {
      if (!isBilling(state.status)) return state
      const closed = closeBillingSpan(state, event.at)
      return { ...closed, status: 'closing', last: summarise(state, 'cap', event.at) }
    }

    case 'FAIL': {
      if (state.status === 'idle' || state.status === 'failed') return state
      const closed = closeBillingSpan(state, event.at)
      return {
        ...closed,
        status: 'failed',
        failure: event.reason,
        last: summarise(state, 'failed', event.at, event.reason)
      }
    }

    case 'CLOSED': {
      if (state.status !== 'closing' && state.status !== 'failed') return state
      return {
        ...initialSession,
        capSeconds: state.capSeconds,
        garmentId: state.garmentId,
        failure: state.status === 'failed' ? state.failure : null,
        last: state.last
      }
    }

    default:
      return state
  }
}

export type StatusWord = 'ready' | 'connecting' | 'live' | 'reconnecting' | 'stopped'

/** The one word shown next to the dot in the top bar. */
export function statusWord(status: SessionStatus): StatusWord {
  switch (status) {
    case 'idle':
      return 'ready'
    case 'requesting':
    case 'negotiating':
      return 'connecting'
    case 'live':
    case 'swapping':
      return 'live'
    case 'degraded':
      return 'reconnecting'
    case 'closing':
    case 'failed':
      return 'stopped'
  }
}

/** mm:ss, mono, never reflows. */
export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return mm + ':' + ss
}

export function formatCost(cost: number): string {
  return '$' + cost.toFixed(2)
}
