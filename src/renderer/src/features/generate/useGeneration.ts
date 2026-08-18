import { useCallback, useRef, useState } from 'react'
import { platform } from '@/platform'
import type { GarmentWithThumb, ModelPhotoWithThumb } from '@shared/types'
import { generateStill, planStill, type StillPlan } from './fashn'

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
  /** The finished image, kept until the next run or an explicit discard. */
  imageUrl: string | null
  /** What the last finished or failed run actually cost. */
  spent: number
  error: string | null
  generate: (photo: ModelPhotoWithThumb, garments: readonly GarmentWithThumb[]) => Promise<void>
  discard: () => void
}

export function useGeneration(): UseGenerationResult {
  const [status, setStatus] = useState<GenerationStatus>('idle')
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [spent, setSpent] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  const generate = useCallback(
    async (photo: ModelPhotoWithThumb, garments: readonly GarmentWithThumb[]): Promise<void> => {
      if (busy.current) return

      const plan: StillPlan = planStill(garments)
      if (plan.steps.length === 0) {
        setStatus('failed')
        setError('There is nothing here a still can wear. Use the mirror instead.')
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
        if (!apiKey) throw new Error('Fleek has no fal API key. Add one in Settings.')

        const url = await generateStill({
          apiKey,
          photo,
          plan,
          onStep: (index, total) => setProgress({ step: index + 1, total }),
          onBilled: (cost) => {
            billed += cost
            setSpent(billed)
            void platform.logSession({ kind: 'still', cost })
          }
        })

        setImageUrl(url)
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
    []
  )

  const discard = useCallback(() => {
    setImageUrl(null)
    setStatus('idle')
    setError(null)
  }, [])

  return { status, progress, imageUrl, spent, error, generate, discard }
}
