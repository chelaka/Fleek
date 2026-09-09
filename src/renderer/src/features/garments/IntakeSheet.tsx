import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Check } from '@phosphor-icons/react'
import { DEFAULT_SLOT, SLOTS, slotDef, type GarmentInput, type SlotId } from '@shared/types'
import { Button } from '@/ui/Button'
import { TextField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/Toast'
import { labelFromFilename, prepareImage } from '@/lib/intake'
import { SourcePicker } from '@/features/intake/SourcePicker'

export interface IntakeSheetProps {
  open: boolean
  onClose: () => void
  /** The live local preview, used by "Shoot it". */
  localStream: MediaStream | null
  /** Which slot the sheet opens on, when a wardrobe row asked for it. */
  defaultSlot?: SlotId
  onAdd: (input: GarmentInput) => Promise<unknown>
}

/** An image that has been chosen but not yet committed to the wardrobe. */
interface Draft {
  blob: Blob
  filename: string
  /** An object URL, revoked as soon as the draft is dropped. */
  previewUrl: string
}

type Busy = null | 'reading'

/**
 * Adding a garment, in two steps rather than one.
 *
 * The old sheet asked what the garment was before it had one: you picked a
 * slot out of seven, then went looking for an image, and the name came from
 * whatever the file happened to be called. Now the image comes first and
 * everything else is asked about something you can see -- which is also the
 * only point at which "is this a jacket or a top?" is a question with an
 * obvious answer.
 */
export function IntakeSheet({
  open,
  onClose,
  localStream,
  defaultSlot,
  onAdd
}: IntakeSheetProps): JSX.Element {
  const toast = useToast()
  const [busy, setBusy] = useState<Busy>(null)
  const [slot, setSlot] = useState<SlotId>(defaultSlot ?? DEFAULT_SLOT)
  const [name, setName] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)

  const dropDraft = useCallback((current: Draft | null): void => {
    if (current) URL.revokeObjectURL(current.previewUrl)
  }, [])

  // Opening resets the sheet to whichever slot asked for it, so the + on the
  // Shoes row does not quietly add a top.
  useEffect(() => {
    if (!open) return
    setBusy(null)
    setSlot(defaultSlot ?? DEFAULT_SLOT)
  }, [open, defaultSlot])

  // Closing throws away an uncommitted image rather than holding a blob URL
  // and a half-answered form until the next time the sheet opens.
  useEffect(() => {
    if (open) return
    setDraft((current) => {
      dropDraft(current)
      return null
    })
    setName('')
  }, [open, dropDraft])

  const choose = useCallback(
    (blob: Blob, filename: string): void => {
      setDraft((current) => {
        dropDraft(current)
        return { blob, filename, previewUrl: URL.createObjectURL(blob) }
      })
      setName(labelFromFilename(filename, 'Garment'))
    },
    [dropDraft]
  )

  const back = useCallback((): void => {
    setDraft((current) => {
      dropDraft(current)
      return null
    })
    setName('')
  }, [dropDraft])

  const commit = useCallback(async (): Promise<void> => {
    if (!draft) return
    try {
      setBusy('reading')
      const prepared = await prepareImage(draft.blob, draft.filename)

      await onAdd({ name: name.trim() || labelFromFilename(draft.filename, 'Garment'), slot, ...prepared })
      onClose()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'That image would not go through.'
      toast.say(message, 'alarm')
    } finally {
      setBusy(null)
    }
  }, [draft, name, onAdd, onClose, slot, toast])

  const working = busy !== null
  const def = slotDef(slot)

  return (
    <Sheet
      open={open}
      title={draft ? 'What is it?' : 'Add a garment'}
      subtitle={
        draft
          ? 'One garment per slot, so adding this takes over ' + def.label + '.'
          : 'A photo of the garment on a person works better than a flat-lay.'
      }
      onClose={onClose}
    >
      {draft ? (
        <>
          <div className="flex gap-4">
            <img
              src={draft.previewUrl}
              alt="The garment you are adding"
              className="h-[128px] w-[128px] flex-none rounded-lg border border-glass-200 bg-glass-000 object-cover"
            />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-4">
              <TextField
                label="Name"
                value={name}
                spellCheck={false}
                disabled={working}
                placeholder="Oat waffle tee"
                onChange={(e) => setName(e.currentTarget.value)}
              />
              <Button variant="ghost" icon={<ArrowLeft size={20} />} disabled={working} onClick={back}>
                Different image
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-12 font-medium uppercase tracking-wide text-glass-600">
              Worn as
            </span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Worn as">
              {SLOTS.map((option) => {
                const selected = option.id === slot
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={working}
                    onClick={() => setSlot(option.id)}
                    className={
                      'h-8 rounded-full px-4 text-12 transition-colors disabled:cursor-not-allowed ' +
                      (selected
                        ? 'bg-glass-900 text-glass-000'
                        : 'bg-glass-200 text-glass-600 hover:text-glass-900')
                    }
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          {def.caveat ? <p className="text-12 text-alarm-700">{def.caveat}</p> : null}

          <div className="flex items-center gap-4 border-t border-glass-200 pt-4">
            <Button
              variant="primary"
              icon={<Check size={20} weight="bold" />}
              disabled={working}
              onClick={() => void commit()}
            >
              {working ? 'Reading' : 'Add to wardrobe'}
            </Button>
            <span className="text-12 text-glass-600">
              {working ? 'Reading the image.' : 'It stays on this machine, and goes on straight away.'}
            </span>
          </div>
        </>
      ) : (
        <SourcePicker
          localStream={localStream}
          busy={working}
          shootHint="hold the garment up to the camera"
          onBlob={choose}
        />
      )}
    </Sheet>
  )
}
