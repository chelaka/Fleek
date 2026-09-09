/**
 * What a garment is worn as.
 *
 * v1 was tops only, because a chest-up webcam cannot see anything else. Slots
 * lift that restriction where the framing allows it and are honest about
 * where it doesn't: `visibility` records what the camera can actually see, and
 * the UI warns rather than silently wasting a paid session.
 */

export type SlotId = 'headwear' | 'eyewear' | 'top' | 'outerwear' | 'bag' | 'bottoms' | 'footwear'

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
  /**
   * How the VTON 3.5 prompting guide wants this region named. "Substitute the
   * upper body garment with ..." lands where "substitute the top with ..."
   * drifts, so the guide's own words are stored rather than derived.
   */
  region: string
  /** What a chest-up webcam can see of it. */
  visibility: 'full' | 'partial' | 'none'
  /** Shown under the slot when visibility is not full. */
  caveat?: string
}

/** Ordered head-down, which is also the order they appear in the tray. */
export const SLOTS: readonly SlotDef[] = [
  {
    id: 'headwear',
    label: 'Cap',
    // The guide lists "Substitute the hat with ..." for hats, but that reads
    // as replacing one the person is already wearing -- and most of the time
    // there is no hat there to replace. `add` is the honest verb; `region` is
    // kept for the case where the clause builder ever needs to name it.
    noun: 'hat or cap',
    mode: 'add',
    region: 'the hat',
    visibility: 'full'
  },
  {
    id: 'eyewear',
    label: 'Glasses',
    noun: 'glasses',
    mode: 'add',
    region: 'glasses',
    visibility: 'full'
  },
  {
    id: 'top',
    label: 'Top',
    noun: 'top',
    mode: 'replace',
    region: 'the upper body garment',
    visibility: 'full'
  },
  {
    id: 'outerwear',
    label: 'Jacket',
    noun: 'jacket or coat',
    mode: 'add',
    region: 'a jacket',
    visibility: 'full'
  },
  {
    id: 'bag',
    label: 'Bag',
    noun: 'bag',
    mode: 'add',
    region: 'a bag',
    visibility: 'partial',
    caveat: 'Only the strap and the top of a bag reach a chest-up frame.'
  },
  {
    id: 'bottoms',
    label: 'Bottoms',
    noun: 'trousers or skirt',
    mode: 'replace',
    region: 'the lower body garment',
    visibility: 'none',
    caveat: 'A chest-up webcam cannot see this. Step back or angle the camera down first.'
  },
  {
    id: 'footwear',
    label: 'Shoes',
    noun: 'shoes',
    mode: 'replace',
    region: 'the footwear',
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
