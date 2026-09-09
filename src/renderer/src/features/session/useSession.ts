import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { platform } from '@/platform'
import type { GarmentWithThumb } from '@shared/types'
import { composeReference, needsComposite, referenceKey } from '@/features/garments/composite'
import { DecartSession } from './decart'
import { describeDecartError, logDecartError } from './errors'
import { buildPrompt } from './prompt'
import {
  billedSeconds,
  capProgress,
  costOf,
  initialSession,
  isActive,
  isBilling,
  isCapReached,
  sessionReducer,
  statusWord,
  type SessionState,
  type StatusWord
} from './machine'

/**
 * Drives the state machine from the outside world: the Decart connection on
 * one side, React on the other. The machine decides what is true; this hook
 * only relays events into it and effects out of it.
 */

export interface SessionMeter {
  seconds: number
  cost: number
  /** 0 to 1 toward the hard cap. */
  progress: number
  /** True past 80%, which is where the HUD turns amber. */
  warning: boolean
}

export interface UseSessionResult {
  state: SessionState
  status: StatusWord
  billing: boolean
  active: boolean
  meter: SessionMeter
  remoteStream: MediaStream | null
  /** Bumped on every applied garment, which is what triggers the wipe. */
  wipeKey: number
  /** Everything worn, ordered head-down. Composited into one reference sheet. */
  start: (garments: readonly GarmentWithThumb[]) => Promise<void>
  stop: () => void
  swap: (garments: readonly GarmentWithThumb[]) => void
}

export interface UseSessionOptions {
  /** The mirrored webcam feed, or null while the camera is still opening. */
  localStream: MediaStream | null
  capSeconds: number
  promptOverride: string
}

/**
 * Decart takes one reference image, as bytes. A single garment is sent as-is
 * -- its own original is already the best reference there is -- and several
 * are drawn onto one sheet whose panels the prompt then names.
 *
 * Nothing is uploaded ahead of time any more, so building a sheet is local
 * work and costs a canvas draw rather than a round trip.
 */
async function buildReference(garments: readonly GarmentWithThumb[]): Promise<Blob> {
  const first = garments[0]
  if (!first) throw new Error('Pick a garment first.')
  if (!needsComposite(garments.length)) return await platform.getImage('garment', first.id)
  return await composeReference(garments)
}

export function useSession(options: UseSessionOptions): UseSessionResult {
  const [state, dispatch] = useReducer(sessionReducer, initialSession)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [wipeKey, setWipeKey] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const sessionRef = useRef<DecartSession | null>(null)
  /** The reference sheet currently in the model's hands, so an unchanged set
   *  of garments is never rebuilt. */
  const referenceRef = useRef<{ key: string } | null>(null)
  // The reducer's own state, readable from callbacks and timers without
  // making every callback depend on the render cycle.
  const stateRef = useRef(state)
  stateRef.current = state

  const teardown = useCallback(() => {
    sessionRef.current?.dispose()
    sessionRef.current = null
    referenceRef.current = null
    setRemoteStream(null)
  }, [])

  const start = useCallback(
    async (garments: readonly GarmentWithThumb[]): Promise<void> => {
      if (stateRef.current.status !== 'idle') return
      if (!options.localStream) return

      const worn = [...garments]
      const first = worn[0]
      if (!first) return

      const at = Date.now()
      dispatch({ type: 'START', garmentId: first.id, capSeconds: options.capSeconds, at })

      const apiKey = await platform.getApiKey()
      if (!apiKey) {
        dispatch({
          type: 'FAIL',
          reason: 'Fleek has no Decart API key. Add one in Settings.',
          at: Date.now()
        })
        return
      }

      // Building the sheet happens before the connection opens, so a failure
      // here costs nothing -- the meter only ever starts at the first frame.
      let reference: Blob
      try {
        reference = await buildReference(worn)
        referenceRef.current = { key: referenceKey(worn) }
      } catch (error) {
        logDecartError('reference sheet', error)
        const message =
          error instanceof Error ? error.message : describeDecartError(error, 'session')
        dispatch({ type: 'FAIL', reason: message, at: Date.now() })
        return
      }

      const session = new DecartSession({
        apiKey,
        capSeconds: options.capSeconds,
        reference,
        prompt: buildPrompt(worn, options.promptOverride),
        localStream: options.localStream,
        onNegotiating: () => dispatch({ type: 'NEGOTIATING', at: Date.now() }),
        onGenerationStarted: () => {
          const wasLive = isBilling(stateRef.current.status)
          dispatch({ type: 'GENERATION_STARTED', at: Date.now() })
          if (!wasLive) {
            void platform.logSession({ kind: 'live-enter' })
          }
          setWipeKey((k) => k + 1)
        },
        onRemoteStream: setRemoteStream,
        onDegraded: () => dispatch({ type: 'DEGRADED', at: Date.now() }),
        onRecovered: () => dispatch({ type: 'RECOVERED', at: Date.now() }),
        onFailure: (reason) => {
          // DecartSession has already closed the connection by this point.
          sessionRef.current = null
          setRemoteStream(null)
          dispatch({ type: 'FAIL', reason, at: Date.now() })
        }
      })

      sessionRef.current = session
      session.start()
    },
    [options.capSeconds, options.localStream, options.promptOverride]
  )

  const stop = useCallback(() => {
    if (!isActive(stateRef.current.status)) return
    teardown()
    dispatch({ type: 'STOP', at: Date.now() })
  }, [teardown])

  const swap = useCallback(
    (garments: readonly GarmentWithThumb[]) => {
      const current = stateRef.current
      if (current.status !== 'live' && current.status !== 'degraded') return

      const worn = [...garments]
      const first = worn[0]
      if (!first) return

      const key = referenceKey(worn)
      if (referenceRef.current?.key === key) return

      dispatch({ type: 'SWAP_REQUESTED', garmentId: first.id, at: Date.now() })
      setWipeKey((k) => k + 1)

      // Rebuilding the sheet is local work now, and the connection stays open
      // throughout -- this is a message, not a reconnect.
      void (async () => {
        try {
          const reference = await buildReference(worn)
          referenceRef.current = { key }
          sessionRef.current?.swap(reference, buildPrompt(worn, options.promptOverride))
        } catch (error) {
          // A failed swap must not end a paid session: the model keeps
          // wearing what it already had, and the user is told.
          logDecartError('swap reference', error)
        } finally {
          // The model does not announce a swap, so the machine settles back to
          // `live` on the same timing as the wipe that covers it.
          dispatch({ type: 'SWAP_APPLIED', at: Date.now() })
        }
      })()
    },
    [options.promptOverride]
  )

  // One clock for the whole HUD, running only while money is moving.
  useEffect(() => {
    if (!isBilling(state.status)) return
    const id = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [state.status])

  // The hard cap closes the session itself, and says why.
  useEffect(() => {
    if (!isBilling(state.status)) return
    if (!isCapReached(state, now)) return
    teardown()
    dispatch({ type: 'CAP_REACHED', at: Date.now() })
  }, [now, state, teardown])

  // `closing` is a promise to be idle shortly; the connection is already gone
  // by the time we get here, so this just settles the machine.
  useEffect(() => {
    if (state.status !== 'closing' && state.status !== 'failed') return
    if (state.last) {
      void platform.logSession({
        kind: 'live-exit',
        seconds: Math.round(state.last.seconds),
        cost: state.last.cost
      })
    }
    const id = window.setTimeout(() => dispatch({ type: 'CLOSED', at: Date.now() }), 400)
    return () => window.clearTimeout(id)
    // `last` is written at the same moment as the status, so keying on the
    // status alone is enough and avoids double-logging on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status])

  // Nothing may outlive this component. Unmount, navigation, hot reload and
  // window close all land here, and all of them close the peer connection.
  useEffect(() => {
    const onUnload = (): void => sessionRef.current?.dispose()
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('pagehide', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('pagehide', onUnload)
      sessionRef.current?.dispose()
      sessionRef.current = null
    }
  }, [])

  const meter = useMemo<SessionMeter>(() => {
    const seconds = billedSeconds(state, now)
    const progress = capProgress(state, now)
    return { seconds, cost: costOf(seconds), progress, warning: progress >= 0.8 }
  }, [state, now])

  return {
    state,
    status: statusWord(state.status),
    billing: isBilling(state.status),
    active: isActive(state.status),
    meter,
    remoteStream,
    wipeKey,
    start,
    stop,
    swap
  }
}
