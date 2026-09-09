import { useEffect, useRef, useState } from 'react'
import type { FaceDetector } from '@mediapipe/tasks-vision'
import type { PresenceSignal } from './presence'

/**
 * Is there a person in front of the camera?
 *
 * On-device, and that is the whole point: the webcam already runs from the
 * moment the app opens, and this watches it without sending a frame
 * anywhere. Nothing here is billed, nothing here leaves the machine, and the
 * detector never touches the paid connection -- it only reports, and
 * `presence.ts` decides what that report is allowed to do.
 *
 * The model is BlazeFace short-range: a face at webcam distance. A face
 * rather than a body, because the mirror is a chest-up framing anyway and a
 * face detector is a tenth the size of a pose model.
 */

export interface UsePresenceResult {
  /** What the detector currently sees, and since when. */
  signal: PresenceSignal
  /** True once the model has loaded and is actually looking. */
  ready: boolean
  /**
   * Why presence is unavailable, as a sentence, or null.
   *
   * The runtime is a 12MB lazy download that a clone without `npm run models`
   * simply will not have. That must degrade to "this feature is off" rather
   * than to a broken mirror, so the failure is reported and swallowed.
   */
  error: string | null
}

/**
 * The gap *between* detections, not the period of a fixed timer.
 *
 * Four times a second is plenty -- a person does not arrive faster than that
 * -- but the important word is "between". Inference takes anywhere from a few
 * milliseconds on a machine with a working GPU delegate to well over a second
 * on one that has fallen back to CPU, and a fixed interval shorter than the
 * inference would queue callbacks faster than they can run and wedge the main
 * thread. Each pass schedules the next one only once it has finished, so a
 * slow machine detects less often instead of seizing up.
 */
const GAP_MS = 250

export function usePresence(
  stream: MediaStream | null,
  enabled: boolean
): UsePresenceResult {
  const [signal, setSignal] = useState<PresenceSignal>(() => ({ seen: false, since: Date.now() }))
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Held in a ref so the detection loop can compare against the last value
  // without re-subscribing every time the value changes.
  const seenRef = useRef(false)

  useEffect(() => {
    if (!enabled || !stream) {
      setReady(false)
      // Idle reports "not seen" rather than a stale "seen", so switching a
      // mode on can never inherit a presence nobody has checked.
      seenRef.current = false
      setSignal({ seen: false, since: Date.now() })
      return
    }

    let disposed = false
    let detector: FaceDetector | null = null
    let timer: number | null = null
    const video = document.createElement('video')

    const report = (seen: boolean): void => {
      if (disposed || seen === seenRef.current) return
      seenRef.current = seen
      setSignal({ seen, since: Date.now() })
    }

    void (async () => {
      try {
        // Imported here rather than at the top of the file: the runtime is
        // ~12MB and nobody on Manual should pay for a byte of it.
        const vision = await import('@mediapipe/tasks-vision')
        const fileset = await vision.FilesetResolver.forVisionTasks('/vision/wasm')
        if (disposed) return

        const options = {
          baseOptions: { modelAssetPath: '/vision/blaze_face_short_range.tflite' },
          runningMode: 'VIDEO' as const,
          // A face across a room is not someone using the mirror. The
          // short-range model already leans this way; the threshold keeps a
          // half-guess in a doorway from starting a paid session.
          minDetectionConfidence: 0.5
        }

        // GPU where there is one, CPU where there is not. The delegate is not
        // negotiable at runtime -- asking for GPU on a machine without a
        // usable one throws rather than degrading -- so the fallback is here.
        try {
          detector = await vision.FaceDetector.createFromOptions(fileset, {
            ...options,
            baseOptions: { ...options.baseOptions, delegate: 'GPU' }
          })
        } catch {
          detector = await vision.FaceDetector.createFromOptions(fileset, {
            ...options,
            baseOptions: { ...options.baseOptions, delegate: 'CPU' }
          })
        }
        if (disposed) {
          detector.close()
          return
        }

        video.srcObject = stream
        video.muted = true
        video.playsInline = true
        await video.play()
        if (disposed) return

        setReady(true)

        const pass = (): void => {
          if (disposed) return

          // A backgrounded tab throttles timers and stops producing frames,
          // so there is nothing to look at and no point burning a CPU core
          // guessing. The grace period holds any running session meanwhile.
          if (!document.hidden && detector && video.readyState >= 2) {
            try {
              const result = detector.detectForVideo(video, performance.now())
              report(result.detections.length > 0)
            } catch {
              // A single dropped frame is not worth tearing the detector
              // down; the grace period in `presence.ts` absorbs it.
            }
          }

          if (!disposed) timer = window.setTimeout(pass, GAP_MS)
        }

        pass()
      } catch (caught) {
        if (disposed) return
        console.error('[fleek] presence detector', caught)
        setReady(false)
        setError(
          'Presence detection could not start, so the mirror is on manual. Run `npm run models` if this is a fresh clone.'
        )
      }
    })()

    return () => {
      disposed = true
      if (timer !== null) window.clearTimeout(timer)
      try {
        detector?.close()
      } catch {
        /* already closed */
      }
      // The stream belongs to the camera feature and keeps running; only this
      // element's hold on it is released.
      video.srcObject = null
      setReady(false)
    }
  }, [stream, enabled])

  return { signal, ready, error }
}
