/**
 * What a garment is worn as.
 *
 * v1 was tops only, because a chest-up webcam cannot see anything else. Slots
 * lift that restriction where the framing allows it and are honest about
 * where it doesn't: `visibility` records what the camera can actually see, and
 * the UI warns rather than silently wasting a paid session.
 */

export type SlotId = 'headwear' | 'eyewear' | 'top' | 'outerwear' | 'bag' | 'bottoms' | 'footwear'

/**
 * The garment categories FASHN accepts. It is a try-on model, not a general
 * image editor: it dresses a torso and legs and knows nothing about hats,
 * glasses, bags or shoes.
 */
export type FashnCategory = 'tops' | 'bottoms' | 'one-pieces'

export interface SlotDef {
  id: SlotId
  /** Tray and picker label. */
  label: string
  /** How the prompt refers to it. */
  noun: string
  /**
   * `replace` swaps something the person is already wearing; `add` puts on
   * something that may not be there at all. The model needs the difference.
   */
  mode: 'replace' | 'add'
  /** What a chest-up webcam can see of it. */
  visibility: 'full' | 'partial' | 'none'
  /** Shown under the slot when visibility is not full. */
  caveat?: string
  /**
   * Which FASHN category this slot is generated as, or absent if FASHN
   * cannot wear it at all. The live model has no such limit, which is why
   * this lives beside `visibility` rather than replacing it: each mode is
   * blind to different things.
   */
  category?: FashnCategory
}

/** Ordered head-down, which is also the order they appear in the tray. */
export const SLOTS: readonly SlotDef[] = [
  { id: 'headwear', label: 'Cap', noun: 'hat or cap', mode: 'add', visibility: 'full' },
  { id: 'eyewear', label: 'Glasses', noun: 'glasses', mode: 'add', visibility: 'full' },
  { id: 'top', label: 'Top', noun: 'top', mode: 'replace', visibility: 'full', category: 'tops' },
  {
    id: 'outerwear',
    label: 'Jacket',
    noun: 'jacket or coat',
    mode: 'add',
    visibility: 'full',
    category: 'tops'
  },
  {
    id: 'bag',
    label: 'Bag',
    noun: 'bag',
    mode: 'add',
    visibility: 'partial',
    caveat: 'Only the strap and the top of a bag reach a chest-up frame.'
  },
  {
    id: 'bottoms',
    label: 'Bottoms',
    noun: 'trousers or skirt',
    mode: 'replace',
    visibility: 'none',
    caveat: 'A chest-up webcam cannot see this. Step back or angle the camera down first.',
    category: 'bottoms'
  },
  {
    id: 'footwear',
    label: 'Shoes',
    noun: 'shoes',
    mode: 'replace',
    visibility: 'none',
    caveat: 'A chest-up webcam cannot see this. Step back or angle the camera down first.'
  }
] as const

export const DEFAULT_SLOT: SlotId = 'top'

export function slotDef(id: SlotId): SlotDef {
  return SLOTS.find((slot) => slot.id === id) ?? SLOTS[2]!
}

export function isSlotId(value: unknown): value is SlotId {
  return typeof value === 'string' && SLOTS.some((slot) => slot.id === value)
}

/** Active garments are always ordered head-down, whatever order they were picked. */
export function slotOrder(id: SlotId): number {
  const index = SLOTS.findIndex((slot) => slot.id === id)
  return index === -1 ? SLOTS.length : index
}
