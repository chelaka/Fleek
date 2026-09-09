import {
  PRESENCE_ARRIVE_SECONDS,
  PRESENCE_GRACE_SECONDS,
  type PresenceMode
} from '@shared/types'

/**
 * When a face in the frame is allowed to move money.
 *
 * The detector is jittery by nature: it loses a face when you turn your head,
 * when you reach for a jacket, when the light changes. Feeding that stream
 * straight into `session.start()` would open and close paid connections
 * several times a minute, so nothing here reacts to a single frame. Two
 * separate delays turn a noisy signal into two decisions:
 *
 *   arriving -- must be seen continuously for PRESENCE_ARRIVE_SECONDS
 *   leaving  -- must be unseen continuously for PRESENCE_GRACE_SECONDS
 *
 * They are deliberately not the same number. Leaving is forgiving because
 * getting it wrong drops a session you wanted; arriving is strict because
 * getting it wrong starts spending on an empty room.
 *
 * This file is pure on purpose. The decision is the part worth being sure
 * about, and it is much easier to be sure about it without a webcam, a model
 * and a WebRTC connection in the way.
 */

/** What the detector saw, and for how long it has been saying so. */
export interface PresenceSignal {
  /** Whether a face is in the current frame. */
  seen: boolean
  /** When `seen` last changed, in ms since epoch. */
  since: number
}

export type PresenceAction = 'start' | 'stop' | 'none'

export interface DecideOptions {
  mode: PresenceMode
  signal: PresenceSignal
  /** Whether a billed session is running right now. */
  active: boolean
  /** False when there is nothing to wear, no camera, or a session is closing. */
  canStart: boolean
  /** Now, in ms since epoch. */
  at: number
  arriveSeconds?: number
  graceSeconds?: number
}

/**
 * The whole policy, as one function.
 *
 * Returns what should happen to the session right now, or `none` -- which is
 * the answer the overwhelming majority of the time, since this is called on
 * every detector frame.
 */
export function decidePresence(options: DecideOptions): PresenceAction {
  const {
    mode,
    signal,
    active,
    canStart,
    at,
    arriveSeconds = PRESENCE_ARRIVE_SECONDS,
    graceSeconds = PRESENCE_GRACE_SECONDS
  } = options

  // The camera is not allowed to touch billing at all.
  if (mode === 'manual') return 'none'

  const heldFor = (at - signal.since) / 1000

  if (active) {
    // Both non-manual modes stop, which is the half that can only save money.
    return !signal.seen && heldFor >= graceSeconds ? 'stop' : 'none'
  }

  // Only `auto` may open a paid connection by itself.
  if (mode !== 'auto') return 'none'
  if (!canStart) return 'none'
  return signal.seen && heldFor >= arriveSeconds ? 'start' : 'none'
}

/**
 * The one line the stage shows about presence, or null when it has nothing
 * to add. Only ever speaks when presence is actually driving something.
 */
export function describePresence(
  mode: PresenceMode,
  seen: boolean,
  active: boolean,
  ready: boolean
): string | null {
  if (mode === 'manual' || !ready) return null
  if (seen) return null
  if (active) return 'Nobody in frame. The mirror stops shortly.'
  return mode === 'auto' ? 'Step into frame and the mirror starts.' : null
}
