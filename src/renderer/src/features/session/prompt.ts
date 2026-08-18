import { slotDef, slotOrder, type SlotId } from '@shared/slots'

/**
 * fal takes exactly one `reference_image_url`, so wearing several things at
 * once means compositing them into a single sheet and telling the model which
 * panel is which. This file builds that sentence.
 *
 * The panel names have to match the layout `composite.ts` draws, so both read
 * their geometry from `panelName()` below.
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
  const source = panel ? 'the ' + def.noun + ' in the ' + panel + ' panel' : 'the ' + def.noun + ' in the reference image'

  return def.mode === 'replace'
    ? 'substitute the current ' + def.noun + ' with ' + source
    : 'add ' + source + ' to the person'
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
 * Builds the instruction sent with the reference sheet.
 *
 * @param override a user's advanced prompt, which wins outright.
 */
export function buildPrompt(entries: readonly PromptEntry[], override = ''): string {
  const custom = override.trim()
  if (custom) return custom

  const ordered = orderEntries(entries)
  if (ordered.length === 0) {
    return 'Substitute the current top with the outfit from the reference image, matching its color, material, and fit.'
  }

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
    ', matching color, material, and fit. The reference may show the item alone, laid flat, on a hanger, ' +
    'or worn by someone else -- read its color, material, cut, and construction from whatever is shown. ' +
    'Keep everything else about the person unchanged.'
  )
}
