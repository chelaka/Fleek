import { useCallback, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, Person, X } from '@phosphor-icons/react'
import { MAX_MODEL_PHOTOS, type ModelPhotoInput, type ModelPhotoWithThumb } from '@shared/types'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/Toast'
import { labelFromFilename, prepareImage } from '@/lib/intake'
import { SourcePicker } from '@/features/intake/SourcePicker'

export interface ModelSheetProps {
  open: boolean
  onClose: () => void
  localStream: MediaStream | null
  photos: ModelPhotoWithThumb[]
  activeId: string
  onPick: (id: string) => void
  onAdd: (input: ModelPhotoInput) => Promise<unknown>
  onRemove: (id: string) => void
}

/**
 * Where the still path gets someone to dress.
 *
 * The live mirror never needed this: the person is on camera. A still needs a
 * stored likeness, and storing a likeness is a bigger thing to ask than
 * storing a product photo -- so the sheet says where the photos go and what
 * happens to them, rather than leaving it to the consent screen alone.
 */
export function ModelSheet({
  open,
  onClose,
  localStream,
  photos,
  activeId,
  onPick,
  onAdd,
  onRemove
}: ModelSheetProps): JSX.Element {
  const toast = useToast()
  const reduced = useReducedMotion()
  const [busy, setBusy] = useState(false)

  const full = photos.length >= MAX_MODEL_PHOTOS

  const accept = useCallback(
    async (blob: Blob, name: string): Promise<void> => {
      if (full) {
        toast.say('That is the ' + MAX_MODEL_PHOTOS + ' photos Fleek keeps. Remove one first.', 'alarm')
        return
      }
      try {
        setBusy(true)
        const prepared = await prepareImage(blob, name)
        await onAdd({ name: labelFromFilename(name, 'Photo'), ...prepared })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'That photo would not go through.'
        toast.say(message, 'alarm')
      } finally {
        setBusy(false)
      }
    },
    [full, onAdd, toast]
  )

  return (
    <Sheet
      open={open}
      title="Photos of you"
      subtitle="A full-length photo against a plain wall generates best."
      onClose={onClose}
      size="settings"
    >
      {photos.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-12 font-medium uppercase tracking-wide text-glass-600">
            Generate onto
          </span>
          <div className="scroll-x flex items-center gap-2 pb-1" role="listbox" aria-label="Photos of you">
            {photos.map((photo) => {
              const active = photo.id === activeId
              return (
                <motion.div key={photo.id} className="group relative flex-none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    aria-label={photo.name + (active ? ', selected' : '')}
                    title={photo.name}
                    onClick={() => onPick(photo.id)}
                    className="block h-24 w-16 overflow-hidden rounded bg-glass-200"
                  >
                    {photo.thumbDataUrl ? (
                      <img
                        src={photo.thumbDataUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-glass-600">
                        <Person size={24} />
                      </span>
                    )}
                  </button>

                  {active ? (
                    <motion.span
                      className="pointer-events-none absolute inset-0 flex items-start justify-end rounded p-1"
                      style={{ boxShadow: 'inset 0 0 0 2px var(--bulb-500)' }}
                      initial={reduced ? { opacity: 0 } : { scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-bulb-500 text-glass-900">
                        <Check size={12} weight="bold" />
                      </span>
                    </motion.span>
                  ) : null}

                  <button
                    type="button"
                    aria-label={'Remove ' + photo.name}
                    onClick={() => onRemove(photo.id)}
                    className="tap absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-glass-200 text-glass-900 opacity-0 transition-opacity hover:bg-alarm-500 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <X size={12} />
                  </button>
                </motion.div>
              )
            })}
          </div>
        </div>
      ) : null}

      {full ? (
        <p className="text-12 text-glass-600">
          Fleek keeps {MAX_MODEL_PHOTOS} photos. Remove one to add another.
        </p>
      ) : (
        <SourcePicker
          localStream={localStream}
          busy={busy}
          mirrored
          shootHint="step back, full length"
          onBlob={(blob, name) => void accept(blob, name)}
        />
      )}

      <p className="text-12 text-glass-600">
        {busy
          ? 'Reading the photo'
          : 'Photos are kept on this machine. They are sent to Decart only while a still is generating, and stored nowhere.'}
      </p>
    </Sheet>
  )
}
