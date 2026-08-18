import { fal } from '@fal-ai/client'
import {
  COST_PER_IMAGE,
  FASHN_MODEL_ID,
  SLOTS,
  slotDef,
  type FashnCategory,
  type GarmentWithThumb,
  type ModelPhotoWithThumb,
  type SlotId
} from '@shared/types'
import { describeFalError, logFalError } from '@/features/session/errors'

/**
 * The still path.
 *
 * Everything Fleek knows about FASHN lives in this file, the same way
 * `session/connect.ts` is the only file that knows about Lucy. The two are
 * deliberately not shared: one is a WebRTC stream billed by the second, the
 * other is a request that returns an image and is billed by the image.
 *
 * FASHN dresses one garment at a time, so wearing several means running it
 * several times and feeding each result back in as the next person image.
 * That is also why cost scales with the number of garments and the live
 * mirror's does not.
 */

/**
 * Innermost first. This is not the head-down order the tray and the reference
 * sheet use: layering only looks right if the jacket goes on after the shirt,
 * so the order here is the order you would actually get dressed in.
 *
 * Keyed on the slot rather than the category, because a shirt and a jacket
 * are both `tops` to FASHN and the difference between them is exactly what
 * this ordering is for.
 */
const LAYER_ORDER: Partial<Record<SlotId, number>> = { bottoms: 0, top: 1, outerwear: 2 }

function layer(slot: SlotId): number {
  return LAYER_ORDER[slot] ?? SLOTS.length
}

export interface StillStep {
  garment: GarmentWithThumb
  category: FashnCategory
}

export interface StillPlan {
  /** What FASHN will wear, in the order it will be applied. */
  steps: StillStep[]
  /** What it cannot wear at all. */
  skipped: GarmentWithThumb[]
  cost: number
}

/**
 * Splits the worn set into what the still path can do and what it cannot.
 *
 * FASHN is a try-on model, not a general image editor: it knows tops,
 * bottoms and one-pieces, and nothing about caps, glasses, bags or shoes.
 * Those are dropped here and named in the UI rather than being sent anyway
 * and billed for a result that would ignore them.
 */
export function planStill(garments: readonly GarmentWithThumb[]): StillPlan {
  const steps: StillStep[] = []
  const skipped: GarmentWithThumb[] = []

  for (const garment of garments) {
    const category = slotDef(garment.slot).category
    if (category) steps.push({ garment, category })
    else skipped.push(garment)
  }

  steps.sort((a, b) => layer(a.garment.slot) - layer(b.garment.slot))

  return { steps, skipped, cost: steps.length * COST_PER_IMAGE }
}

/** "Fleek cannot generate a cap or a bag as a still." */
export function describeSkipped(skipped: readonly GarmentWithThumb[]): string {
  if (skipped.length === 0) return ''
  const nouns = [...new Set(skipped.map((g) => slotDef(g.slot).noun))]
  const list =
    nouns.length === 1
      ? nouns[0]!
      : nouns.slice(0, -1).join(', ') + ' or ' + nouns[nouns.length - 1]!
  return 'A still cannot wear ' + list + '. Use the mirror for that.'
}

export interface GenerateOptions {
  apiKey: string
  photo: ModelPhotoWithThumb
  plan: StillPlan
  /**
   * Called as each garment goes on, so the UI can say which of how many is
   * being worn rather than showing an undifferentiated wait.
   */
  onStep?: (index: number, total: number) => void
  /**
   * Called once per completed step, because each one is separately billed --
   * a run that fails on the jacket has still paid for the shirt.
   */
  onBilled?: (cost: number) => void
}

interface FashnOutput {
  images?: { url?: string }[]
}

/**
 * Dresses the photo one garment at a time and returns the final image URL.
 *
 * `mode: 'balanced'` is FASHN's own default and the right one for browsing;
 * `quality` roughly doubles the wait for a difference you would only look
 * for once you had already decided.
 */
export async function generateStill(options: GenerateOptions): Promise<string> {
  const { apiKey, photo, plan } = options
  if (plan.steps.length === 0) throw new Error('There is nothing here a still can wear.')

  fal.config({ credentials: apiKey })

  let modelImage = photo.remoteUrl

  for (let index = 0; index < plan.steps.length; index++) {
    const step = plan.steps[index]!
    options.onStep?.(index, plan.steps.length)

    let result: { data?: FashnOutput }
    try {
      result = await fal.subscribe(FASHN_MODEL_ID, {
        input: {
          model_image: modelImage,
          garment_image: step.garment.remoteUrl,
          category: step.category,
          mode: 'balanced',
          // The library holds product shots as often as worn shots, and
          // guessing wrong costs a generation, so FASHN is told to look.
          garment_photo_type: 'auto',
          output_format: 'png'
        }
      })
    } catch (error) {
      logFalError('fashn.subscribe', error)
      throw new Error(describeFalError(error, 'still'))
    }

    const url = result.data?.images?.[0]?.url
    if (!url) throw new Error('fal returned no image. Nothing further was billed.')

    options.onBilled?.(COST_PER_IMAGE)
    modelImage = url
  }

  return modelImage
}
