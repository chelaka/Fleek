import { motion, useReducedMotion } from 'motion/react'
import { Plus, TShirt, Warning, X } from '@phosphor-icons/react'
import { SLOTS, type GarmentWithThumb, type SlotDef, type SlotId } from '@shared/types'

export interface WardrobeProps {
  garments: GarmentWithThumb[]
  /** The garment worn in each slot. A slot may be empty. */
  activeBySlot: Partial<Record<SlotId, string>>
  /** Fills the garment's own slot, or empties it if it was already worn. */
  onToggle: (garment: GarmentWithThumb) => void
  onRemove: (id: string) => void
  /** Opens intake. A slot means the row's own +, so the sheet opens pre-set. */
  onAdd: (slot?: SlotId) => void
}

/**
 * What you own, one row per slot.
 *
 * The old tray was a single strip of everything, which made the one rule that
 * governs it -- one garment per slot, so a second top replaces the first but a
 * cap does not -- something you had to learn by clicking. Rows make it the
 * shape of the thing: a row is a slot, what is worn in it is ringed, and
 * picking anything else on that row swaps it. Rows only exist for slots you
 * actually own something for, so the panel stays as short as the wardrobe is.
 */
export function Wardrobe({
  garments,
  activeBySlot,
  onToggle,
  onRemove,
  onAdd
}: WardrobeProps): JSX.Element {
  // Head-down, the order SLOTS is declared in, so the panel reads like a body.
  const rows = SLOTS.map((def) => ({
    def,
    items: garments.filter((garment) => garment.slot === def.id)
  })).filter((row) => row.items.length > 0)

  const wornCount = rows.filter((row) => activeBySlot[row.def.id]).length

  if (garments.length === 0) {
    return (
      <section
        aria-label="Wardrobe"
        className="panel flex w-full flex-col items-center justify-center gap-4 rounded-panel p-6 text-center"
      >
        <button
          type="button"
          onClick={() => onAdd()}
          className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-glass-400 text-glass-600 transition-colors hover:border-bulb-500 hover:text-bulb-500"
          aria-label="Add a garment"
        >
          <TShirt size={24} />
        </button>
        <p data-face="display" className="text-16 text-glass-600">
          Nothing hanging up yet.
        </p>
      </section>
    )
  }

  return (
    <section
      aria-label="Wardrobe"
      className="panel flex min-h-0 w-full flex-col overflow-hidden rounded-panel"
    >
      <header className="flex flex-none items-center gap-3 px-4 pb-2 pt-3">
        <h2 className="text-12 font-medium uppercase tracking-wide text-glass-600">Wardrobe</h2>
        <span className="text-12 text-glass-400">
          {wornCount === 0 ? 'nothing on' : wornCount + ' on'}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => onAdd()}
          aria-label="Add a garment"
          className="tap flex h-8 w-8 flex-none items-center justify-center rounded-full bg-glass-200 text-glass-900 transition-colors hover:bg-bulb-500"
        >
          <Plus size={16} />
        </button>
      </header>

      <div className="scroll-y flex min-h-0 flex-col gap-1 px-2 pb-2">
        {rows.map((row) => (
          <SlotRow
            key={row.def.id}
            def={row.def}
            items={row.items}
            activeId={activeBySlot[row.def.id]}
            onToggle={onToggle}
            onRemove={onRemove}
            onAdd={onAdd}
          />
        ))}
      </div>
    </section>
  )
}

interface SlotRowProps {
  def: SlotDef
  items: GarmentWithThumb[]
  activeId: string | undefined
  onToggle: (garment: GarmentWithThumb) => void
  onRemove: (id: string) => void
  onAdd: (slot?: SlotId) => void
}

/** One slot, everything you own for it, and whichever one is on. */
function SlotRow({ def, items, activeId, onToggle, onRemove, onAdd }: SlotRowProps): JSX.Element {
  const worn = items.find((garment) => garment.id === activeId)

  return (
    <div
      className={
        'rounded-lg px-2 py-2 transition-colors ' + (worn ? 'bg-bulb-100' : 'hover:bg-glass-100')
      }
    >
      <div className="flex items-center gap-2 px-1 pb-2">
        <span className="flex-none text-12 font-medium uppercase tracking-wide text-glass-900">
          {def.label}
        </span>

        {/* What a chest-up frame cannot show is said on the slot, not after a
            paid session comes back without it. */}
        {def.visibility !== 'full' ? (
          <span className="flex-none text-glass-400" title={def.caveat} aria-label={def.caveat}>
            <Warning size={12} />
          </span>
        ) : null}

        {worn ? (
          <span className="min-w-0 flex-1 truncate text-12 text-bulb-700">{worn.name}</span>
        ) : (
          <span className="flex-1" />
        )}

        {worn ? (
          <button
            type="button"
            onClick={() => onToggle(worn)}
            aria-label={'Take off ' + worn.name}
            className="tap flex h-4 w-4 flex-none items-center justify-center rounded-full text-bulb-700 transition-colors hover:text-glass-900"
          >
            <X size={12} />
          </button>
        ) : null}
      </div>

      <div
        className="scroll-x flex items-center gap-2 px-1 pb-1"
        role="listbox"
        aria-label={def.label}
      >
        {items.map((garment) => (
          <Tile
            key={garment.id}
            garment={garment}
            def={def}
            active={garment.id === activeId}
            onToggle={onToggle}
            onRemove={onRemove}
          />
        ))}

        <button
          type="button"
          onClick={() => onAdd(def.id)}
          aria-label={'Add to ' + def.label}
          className="flex h-16 w-16 flex-none items-center justify-center rounded border border-dashed border-glass-400 text-glass-400 transition-colors hover:border-bulb-500 hover:text-bulb-500"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}

interface TileProps {
  garment: GarmentWithThumb
  def: SlotDef
  active: boolean
  onToggle: (garment: GarmentWithThumb) => void
  onRemove: (id: string) => void
}

/** A 64px thumbnail. Worn is ringed in amber; the row header names it. */
function Tile({ garment, def, active, onToggle, onRemove }: TileProps): JSX.Element {
  const reduced = useReducedMotion()

  return (
    <motion.div
      className="group relative flex-none"
      whileHover={reduced ? undefined : { y: -4 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
    >
      <button
        type="button"
        role="option"
        aria-selected={active}
        aria-label={garment.name + ', worn as ' + def.label + (active ? ', on' : '')}
        title={garment.name}
        onClick={() => onToggle(garment)}
        className={
          'block h-16 w-16 overflow-hidden rounded bg-glass-200 transition-shadow ' +
          (active ? 'shadow-lift' : '')
        }
      >
        {garment.thumbDataUrl ? (
          <img
            src={garment.thumbDataUrl}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-glass-600">
            <TShirt size={24} />
          </span>
        )}
      </button>

      {active ? (
        <motion.span
          className="pointer-events-none absolute inset-0 rounded"
          style={{ boxShadow: 'inset 0 0 0 2px var(--bulb-500)' }}
          initial={reduced ? { opacity: 0 } : { scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        />
      ) : null}

      <button
        type="button"
        aria-label={'Remove ' + garment.name}
        onClick={() => onRemove(garment.id)}
        className="tap absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-glass-900 text-glass-000 opacity-0 transition-opacity hover:bg-alarm-500 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <X size={12} />
      </button>
    </motion.div>
  )
}
