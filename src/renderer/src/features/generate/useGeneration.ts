import { useCallback, useEffect, useRef, useState } from 'react'
import { platform } from '@/platform'
import type { GarmentWithThumb, ModelPhotoWithThumb, StillMode } from '@shared/types'
import { generateStill, planStill, type StillPlan } from './still'

/**
 * The still path's state, deliberately much smaller than the live session's.
 *
 * `session/machine.ts` is a full state machine because a live session can be
 * billing while nothing is on screen, and getting that wrong costs money by
 * the second. A still is a request that either returns an image or does not,
 * and its cost is known before it starts -- so a request, a result and an
 * error is the whole vocabulary.
 */

export type GenerationStatus = 'idle' | 'working' | 'done' | 'failed'

export interface GenerationProgress {
  /** 1-based, for "wearing 2 of 3". */
  step: number
  total: number
}

export interface UseGenerationResult {
  status: GenerationStatus
  /** Set while working, so the UI can count garments rather than spin. */
  progress: GenerationProgress | null
  /**
   * The finished image as an object URL, kept until the next run or an
   * explicit discard. The bytes never leave this machine: `process` returns
   * them directly, so there is no hosted result to expire or leak.
   */
  imageUrl: string | null
  /** What the last finished or failed run actually cost. */
  spent: number
  error: string | null
  generate: (photo: ModelPhotoWithThumb, garments: readonly GarmentWithThumb[]) => Promise<void>
  discard: () => void
}

export interface UseGenerationOptions {
  /** From settings. Read at the moment Generate is pressed, not before. */
  mode: StillMode
}

export function useGeneration(options: UseGenerationOptions): UseGenerationResult {
  const [status, setStatus] = useState<GenerationStatus>('idle')
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [spent, setSpent] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  /**
   * Object URLs are a manual allocation. Every one handed out here is revoked
   * when it is replaced and when this hook goes away, or a browsing session
   * leaks a full-resolution image per garment tried.
   */
  const urlRef = useRef<string | null>(null)
  const showImage = useCallback((blob: Blob | null): void => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = blob ? URL.createObjectURL(blob) : null
    setImageUrl(urlRef.current)
  }, [])

  useEffect(() => () => showImage(null), [showImage])

  const generate = useCallback(
    async (photo: ModelPhotoWithThumb, garments: readonly GarmentWithThumb[]): Promise<void> => {
      if (busy.current) return

      const plan: StillPlan = planStill(garments)
      if (plan.steps.length === 0) {
        setStatus('failed')
        setError('Pick a garment first.')
        return
      }

      busy.current = true
      setStatus('working')
      setError(null)
      setSpent(0)
      setProgress({ step: 1, total: plan.steps.length })

      // Each garment is billed as it completes, so the running total is
      // truthful even if a later step fails.
      let billed = 0

      try {
        const apiKey = await platform.getApiKey()
        if (!apiKey) throw new Error('Fleek has no Decart API key. Add one in Settings.')

        const image = await generateStill({
          apiKey,
          photo,
          plan,
          mode: options.mode,
          onStep: (index, total) => setProgress({ step: index + 1, total }),
          onBilled: (cost) => {
            billed += cost
            setSpent(billed)
            void platform.logSession({ kind: 'still', cost })
          }
        })

        showImage(image)
        setStatus('done')
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : 'The image could not be generated.'
        setError(message)
        setStatus('failed')
      } finally {
        setSpent(billed)
        setProgress(null)
        busy.current = false
      }
    },
    [options.mode, showImage]
  )

  const discard = useCallback(() => {
    showImage(null)
    setStatus('idle')
    setError(null)
  }, [showImage])

  return { status, progress, imageUrl, spent, error, generate, discard }
}
