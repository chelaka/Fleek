import { motion, useReducedMotion } from 'motion/react'
import { Plus, TShirt, X } from '@phosphor-icons/react'
import { slotDef, type GarmentWithThumb, type SlotId } from '@shared/types'

export interface GarmentTrayProps {
  garments: GarmentWithThumb[]
  /** The garment worn in each slot. A slot may be empty. */
  activeBySlot: Partial<Record<SlotId, string>>
  /** Fills the garment's own slot, or empties it if it was already worn. */
  onToggle: (garment: GarmentWithThumb) => void
  onRemove: (id: string) => void
  onAdd: () => void
}

/**
 * 64px tiles, 8px apart. Anything currently worn is ringed in amber, and one
 * garment per slot can be worn at once -- picking a second top replaces the
 * first, while picking a cap leaves the top alone.
 */
export function GarmentTray({
  garments,
  activeBySlot,
  onToggle,
  onRemove,
  onAdd
}: GarmentTrayProps): JSX.Element {
  const reduced = useReducedMotion()

  if (garments.length === 0) {
    return (
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onAdd}
          className="flex h-16 w-16 flex-none items-center justify-center rounded border border-dashed border-glass-400 bg-glass-100 text-glass-600 transition-colors hover:border-bulb-500 hover:text-bulb-500"
          aria-label="Add a garment"
        >
          <TShirt size={24} />
        </button>
        <p data-face="display" className="text-16 text-glass-600">
          Drop a garment photo here.
        </p>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1" role="listbox" aria-label="Garments">
      {garments.map((garment) => {
        const def = slotDef(garment.slot)
        const active = activeBySlot[garment.slot] === garment.id

        return (
          <motion.div
            key={garment.id}
            className="group relative flex-none"
            whileHover={reduced ? undefined : { y: -4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          >
            <button
              type="button"
              role="option"
              aria-selected={active}
              aria-label={garment.name + ', worn as ' + def.label + (active ? ', on' : '')}
              title={def.label + ' — ' + garment.name}
              onClick={() => onToggle(garment)}
              className="block h-16 w-16 overflow-hidden rounded bg-glass-200"
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

            {/* The slot label, so a tray of thumbnails is still readable. */}
            <span
              className={
                'pointer-events-none absolute inset-x-0 bottom-0 truncate px-1 text-center text-12 leading-4 ' +
                (active ? 'bg-bulb-500 text-glass-000' : 'bg-glass-000/80 text-glass-600')
              }
            >
              {def.label}
            </span>

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
              className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-glass-200 text-glass-900 group-hover:flex hover:bg-alarm-500 hover:text-glass-000"
            >
              <X size={12} />
            </button>
          </motion.div>
        )
      })}

      <button
        type="button"
        onClick={onAdd}
        aria-label="Add a garment"
        className="flex h-16 w-16 flex-none items-center justify-center rounded border border-dashed border-glass-400 text-glass-600 transition-colors hover:border-bulb-500 hover:text-bulb-500"
      >
        <Plus size={20} />
      </button>
    </div>
  )
}
