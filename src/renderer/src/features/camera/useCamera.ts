import { platform } from '@/platform'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The local half of the mirror. Owns exactly one MediaStream at a time and is
 * responsible for stopping the previous one whenever the device changes --
 * an orphaned stream leaves the webcam light on, which reads as spying.
 */

export interface CameraDevice {
  deviceId: string
  label: string
}

export interface UseCameraResult {
  stream: MediaStream | null
  devices: CameraDevice[]
  /** A sentence, or null. */
  error: string | null
  /** True while getUserMedia is in flight. */
  opening: boolean
  /** The camera was refused by Windows rather than by the browser layer. */
  blockedByOs: boolean
  retry: () => void
}

/** 1280x720 at 30fps is the target the model is fed. */
const CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 }
}

function sentenceFor(error: unknown): { message: string; blockedByOs: boolean } {
  const name = error instanceof DOMException ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        message: platform.can.osCameraSettings
          ? "Windows isn't giving Fleek access to a camera. Check Settings, Privacy, Camera."
          : 'Your browser is blocking the camera. Allow it from the icon in the address bar, then try again.',
        blockedByOs: true
      }
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { message: 'No camera found. Plug one in, then try again.', blockedByOs: false }
    case 'NotReadableError':
      return {
        message: 'Another app is using the camera. Close it, then try again.',
        blockedByOs: false
      }
    default:
      return { message: 'The camera would not open. Try again, or pick another one in Settings.', blockedByOs: false }
  }
}

export function useCamera(deviceId: string): UseCameraResult {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [devices, setDevices] = useState<CameraDevice[]>([])
  const [error, setError] = useState<string | null>(null)
  const [blockedByOs, setBlockedByOs] = useState(false)
  const [opening, setOpening] = useState(true)
  const [attempt, setAttempt] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)

  const stopCurrent = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const refreshDevices = useCallback(async (): Promise<void> => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      setDevices(
        all
          .filter((d) => d.kind === 'videoinput')
          .map((d, i) => ({
            deviceId: d.deviceId,
            // Labels are blank until permission is granted at least once.
            label: d.label || 'Camera ' + (i + 1)
          }))
      )
    } catch {
      setDevices([])
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setOpening(true)

    async function open(): Promise<void> {
      stopCurrent()
      try {
        const next = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { ...CONSTRAINTS, deviceId: { exact: deviceId } } : CONSTRAINTS,
          audio: false
        })

        if (cancelled) {
          next.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = next
        setStream(next)
        setError(null)
        setBlockedByOs(false)
        await refreshDevices()
      } catch (raw) {
        if (cancelled) return
        // An exact deviceId that has since been unplugged fails hard; falling
        // back to any camera is friendlier than an error the user can't fix.
        if (deviceId && raw instanceof DOMException && raw.name === 'OverconstrainedError') {
          try {
            const fallback = await navigator.mediaDevices.getUserMedia({
              video: CONSTRAINTS,
              audio: false
            })
            if (cancelled) {
              fallback.getTracks().forEach((track) => track.stop())
              return
            }
            streamRef.current = fallback
            setStream(fallback)
            setError(null)
            setBlockedByOs(false)
            await refreshDevices()
            return
          } catch {
            /* fall through to the reported error */
          }
        }
        const { message, blockedByOs: blocked } = sentenceFor(raw)
        setStream(null)
        setError(message)
        setBlockedByOs(blocked)
      } finally {
        if (!cancelled) setOpening(false)
      }
    }

    void open()

    return () => {
      cancelled = true
    }
  }, [deviceId, attempt, refreshDevices, stopCurrent])

  // The stream is stopped only when this hook is torn down for good, not on
  // every device change -- that is handled inside open() before reopening.
  useEffect(() => stopCurrent, [stopCurrent])

  useEffect(() => {
    const onChange = (): void => void refreshDevices()
    navigator.mediaDevices.addEventListener('devicechange', onChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange)
  }, [refreshDevices])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { stream, devices, error, opening, blockedByOs, retry }
}
