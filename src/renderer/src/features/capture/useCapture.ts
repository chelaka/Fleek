import { useCallback, useRef, useState } from 'react'
import { platform } from '@/platform'
import { frameFromVideo } from '@/lib/image'
import { useToast } from '@/ui/Toast'

export interface FlyingThumb {
  id: number
  dataUrl: string
  filePath: string
}

export interface UseCaptureResult {
  /** True for 120ms after the shutter, which is the white flash. */
  flashing: boolean
  /** The still arcing to the corner, or null. */
  flying: FlyingThumb | null
  clearFlying: () => void
  capture: (video: HTMLVideoElement | null) => Promise<void>
}

/** Stills only. Fleek never records video. */
export function useCapture(): UseCaptureResult {
  const toast = useToast()
  const [flashing, setFlashing] = useState(false)
  const [flying, setFlying] = useState<FlyingThumb | null>(null)
  const busy = useRef(false)

  const capture = useCallback(
    async (video: HTMLVideoElement | null): Promise<void> => {
      if (!video || busy.current) return
      busy.current = true
      try {
        // The output element is already mirrored in CSS, so the still has to
        // be mirrored too or the saved file won't match what was on screen.
        const base64 = frameFromVideo(video, true)
        setFlashing(true)
        window.setTimeout(() => setFlashing(false), 120)

        const filePath = await platform.saveCapture(base64)
        setFlying({ id: Date.now(), dataUrl: 'data:image/png;base64,' + base64, filePath })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'The still could not be saved. Try again.'
        toast.say(message, 'alarm')
      } finally {
        busy.current = false
      }
    },
    [toast]
  )

  const clearFlying = useCallback(() => setFlying(null), [])

  return { flashing, flying, clearFlying, capture }
}
