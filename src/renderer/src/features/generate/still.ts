import { platform } from '@/platform'
import {
  COST_PER_IMAGE,
  SLOTS,
  slotDef,
  type GarmentWithThumb,
  type ModelPhotoWithThumb,
  type SlotId,
  type StillMode
} from '@shared/types'
import { decart, imageModel } from '@/features/session/client'
import { describeDecartError, logDecartError } from '@/features/session/errors'

/**
 * The still path.
 *
 * Everything Fleek knows about `lucy-image-2` lives in this file, the same
 * way `session/decart.ts` is the only file that knows about the live mirror.
 * The two are deliberately not shared: one is a WebRTC stream billed by the
 * second, the other is a request that returns an image and is billed by the
 * image.
 *
 * It wears one garment at a time, so wearing several means running it several
 * times and feeding each result back in as the next person image. That is
 * also why cost scales with the number of garments and the live mirror's does
 * not.
 *
 * What changed with the provider: the old still path was a try-on model that
 * knew tops, bottoms and one-pieces and nothing else, so caps, glasses, bags
 * and shoes were dropped from the plan and the UI had to apologise for it.
 * This one is a general image editor handed the garment as a reference image,
 * so every slot is now something a still can wear, and the whole notion of a
 * skipped garment is gone.
 */

/**
 * Innermost first. This is not the head-down order the tray and the reference
 * sheet use: layering only looks right if the jacket goes on after the shirt,
 * so the order here is the order you would actually get dressed in.
 *
 * Accessories come last, once there is an outfit for them to sit on top of.
 */
const LAYER_ORDER: Partial<Record<SlotId, number>> = {
  bottoms: 0,
  footwear: 1,
  top: 2,
  outerwear: 3,
  headwear: 4,
  eyewear: 5,
  bag: 6
}

function layer(slot: SlotId): number {
  return LAYER_ORDER[slot] ?? SLOTS.length
}

export interface StillStep {
  garment: GarmentWithThumb
}

export interface StillPlan {
  /** What the still path will wear, in the order it will be applied. */
  steps: StillStep[]
  cost: number
}

/** Every worn garment is a step, ordered the way you would get dressed. */
export function planStill(garments: readonly GarmentWithThumb[]): StillPlan {
  const steps = [...garments]
    .sort((a, b) => layer(a.slot) - layer(b.slot))
    .map((garment) => ({ garment }))

  return { steps, cost: steps.length * COST_PER_IMAGE }
}

/**
 * One instruction, one garment.
 *
 * The live mirror composites several garments onto one sheet because it only
 * gets one reference image for the whole session. A still does not have that
 * problem -- each garment is its own request with its own reference -- so
 * each prompt names exactly one action, which is what the prompting guide
 * asks for and the composite path can only approximate.
 */
export function stillPrompt(garment: GarmentWithThumb): string {
  const def = slotDef(garment.slot)
  const action =
    def.mode === 'replace'
      ? 'Substitute ' + def.region + ' with the ' + def.noun + ' in the reference image'
      : 'Add the ' + def.noun + ' in the reference image to the outfit'

  return (
    action +
    ', matching its color, pattern, material, and fit. The reference may show the item alone, laid ' +
    'flat, on a hanger, or worn by someone else -- read its color, material, cut, and construction ' +
    "from whatever is shown. Keep the person's face, hair, skin tone, hands, body, and pose " +
    'unchanged, and keep the background and the direction of the light exactly as they are.'
  )
}

export interface GenerateOptions {
  apiKey: string
  photo: ModelPhotoWithThumb
  plan: StillPlan
  /** 720p or 480p. Unlike the old modes, this one is a real trade. */
  mode: StillMode
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
  /** Abandons the run between steps, so nothing further is billed. */
  signal?: AbortSignal
}

/**
 * Dresses the photo one garment at a time and returns the finished image.
 *
 * Returns a Blob rather than a URL: `process` hands back bytes directly, so
 * the result never touches anyone's storage and the caller turns it into an
 * object URL for as long as it is on screen.
 */
export async function generateStill(options: GenerateOptions): Promise<Blob> {
  const { apiKey, photo, plan } = options
  if (plan.steps.length === 0) throw new Error('Pick a garment first.')

  const client = decart(apiKey)

  // The person, as bytes. Each step replaces this with its own result, which
  // is how the garments end up layered rather than each replacing the last.
  let person: Blob = await platform.getImage('photo', photo.id)


  for (let index = 0; index < plan.steps.length; index++) {
    if (options.signal?.aborted) break

    const step = plan.steps[index]!
    options.onStep?.(index, plan.steps.length)

    const reference = await platform.getImage('garment', step.garment.id)

    try {
      person = await client.process({
        model: imageModel,
        prompt: stillPrompt(step.garment),
        data: person,
        reference_image: reference,
        resolution: options.mode,
        // A person and a garment is not a prompt that wants embellishing.
        // Enhancement rewrites the instruction, and a rewritten instruction
        // is one that no longer says "keep the face unchanged".
        enhance_prompt: false,
        ...(options.signal ? { signal: options.signal } : {})
      })
    } catch (error) {
      logDecartError('process(' + imageModel.name + ')', error)
      throw new Error(describeDecartError(error, 'still'))
    }

    options.onBilled?.(COST_PER_IMAGE)
  }

  return person
}
