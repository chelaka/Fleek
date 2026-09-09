import { slotDef, slotOrder, type SlotId } from '@shared/slots'
import { DEFAULT_PROMPT } from '@shared/types'

/**
 * Decart's realtime state holds exactly one reference image, so wearing
 * several things at once means compositing them into a single sheet and
 * telling the model which panel is which. This file builds that sentence.
 *
 * The panel names have to match the layout `composite.ts` draws, so both read
 * their geometry from `panelName()` below.
 *
 * The phrasing follows the VTON 3.5 prompting guide, which is specific about
 * two things: lead with the action, and name the region the way the model
 * names it. "Substitute the upper body garment with ..." is not a stylistic
 * preference over "substitute the top with ..." -- it is the form the model
 * was tuned on, and the slot table carries the exact wording per region.
 */

export interface PromptEntry {
  slot: SlotId
  /** Only used for the caller's own bookkeeping; not in the prompt. */
  garmentId?: string
}

/**
 * Where each item sits in the composite. Two columns, filled left to right,
 * top to bottom -- the same order `composite.ts` draws them.
 */
export function panelName(index: number, count: number): string {
  if (count <= 1) return ''
  if (count === 2) return index === 0 ? 'left' : 'right'

  const columns = 2
  const rows = Math.ceil(count / columns)
  const row = Math.floor(index / columns)
  const column = index % columns

  const vertical = rows === 2 ? (row === 0 ? 'top' : 'bottom') : ordinalRow(row)
  const horizontal = column === 0 ? 'left' : 'right'

  // An odd final item spans the row, so it has no left/right.
  const isLoneLast = index === count - 1 && count % columns === 1
  return isLoneLast ? vertical : vertical + ' ' + horizontal
}

function ordinalRow(row: number): string {
  const names = ['top', 'second', 'third', 'fourth']
  return names[row] ?? 'row ' + (row + 1)
}

function clauseFor(slot: SlotId, panel: string): string {
  const def = slotDef(slot)
  const source = panel
    ? 'the ' + def.noun + ' in the ' + panel + ' panel'
    : 'the ' + def.noun + ' in the reference image'

  // `region` is the guide's own name for the area -- "the upper body garment",
  // "the footwear" -- and `mode` decides which verb it takes.
  return def.mode === 'replace'
    ? 'substitute ' + def.region + ' with ' + source
    : 'add ' + source + ' to the outfit'
}

function joinClauses(clauses: string[]): string {
  if (clauses.length === 1) return clauses[0]!
  if (clauses.length === 2) return clauses[0] + ' and ' + clauses[1]
  return clauses.slice(0, -1).join(', ') + ', and ' + clauses[clauses.length - 1]
}

/** Head-down, matching both the tray and the composite. */
export function orderEntries<T extends PromptEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot))
}

/**
 * What must not change.
 *
 * "Keep everything else unchanged" is too vague to hold a video model to:
 * drift shows up in the face first, then the hands, then the background. It
 * costs nothing to name them, and naming the background and the lighting
 * matters most -- neither is part of "the person", so an instruction phrased
 * around the person never covered them at all.
 */
const PRESERVE =
  "Keep the person's face, hair, skin tone, hands, body, and pose unchanged, and keep the background " +
  'and the direction of the light exactly as they are.'

/**
 * Builds the instruction sent with the reference sheet.
 *
 * @param override a user's advanced prompt, which wins outright.
 */
export function buildPrompt(entries: readonly PromptEntry[], override = ''): string {
  const custom = override.trim()
  if (custom) return custom

  const ordered = orderEntries(entries)
  // Nothing picked is the same situation `connect.ts` falls back to, so it
  // uses the same sentence rather than a second copy that drifts from it.
  if (ordered.length === 0) return DEFAULT_PROMPT

  const clauses = ordered.map((entry, index) => clauseFor(entry.slot, panelName(index, ordered.length)))
  const body = joinClauses(clauses)
  const opening =
    ordered.length > 1
      ? 'The reference image is a grid of ' + ordered.length + ' items. '
      : ''

  // Capitalise the first clause, since it opens the sentence when there is no
  // grid preamble.
  const sentence = opening
    ? opening + body.charAt(0).toUpperCase() + body.slice(1)
    : body.charAt(0).toUpperCase() + body.slice(1)

  return (
    sentence +
    ', matching color, pattern, material, and fit. The reference may show the item alone, laid flat, on a hanger, ' +
    'or worn by someone else -- read its color, material, cut, and construction from whatever is shown. ' +
    PRESERVE
  )
}
