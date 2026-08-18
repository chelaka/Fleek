import { useCallback, useEffect, useState } from 'react'
import { platform } from '@/platform'
import { DEFAULT_SLOT, SLOTS, slotDef, type GarmentInput, type SlotId } from '@shared/types'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/Toast'
import { labelFromFilename, prepareImage } from '@/lib/intake'
import { SourcePicker } from '@/features/intake/SourcePicker'

export interface IntakeSheetProps {
  open: boolean
  onClose: () => void
  /** The live local preview, used by "Shoot it". */
  localStream: MediaStream | null
  onAdd: (input: GarmentInput) => Promise<unknown>
}

type Busy = null | 'reading' | 'uploading'

export function IntakeSheet({ open, onClose, localStream, onAdd }: IntakeSheetProps): JSX.Element {
  const toast = useToast()
  const [busy, setBusy] = useState<Busy>(null)
  const [slot, setSlot] = useState<SlotId>(DEFAULT_SLOT)

  useEffect(() => {
    if (!open) {
      setBusy(null)
      setSlot(DEFAULT_SLOT)
    }
  }, [open])

  const accept = useCallback(
    async (blob: Blob, name: string): Promise<void> => {
      try {
        setBusy('reading')
        const apiKey = await platform.getApiKey()
        if (!apiKey) {
          toast.say('Fleek has no fal API key. Add one in Settings.', 'alarm')
          return
        }

        setBusy('uploading')
        const prepared = await prepareImage(apiKey, blob, name)

        await onAdd({ name: labelFromFilename(name, 'Garment'), slot, ...prepared })
        onClose()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'That image would not go through.'
        toast.say(message, 'alarm')
      } finally {
        setBusy(null)
      }
    },
    [onAdd, onClose, slot, toast]
  )

  const working = busy !== null
  const busyLabel = busy === 'uploading' ? 'Uploading to fal' : 'Reading'

  return (
    <Sheet open={open} title="Add a garment" onClose={onClose}>
      <div className="flex flex-col gap-2">
        <span className="text-12 font-medium uppercase tracking-wide text-glass-600">Worn as</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Worn as">
          {SLOTS.map((option) => {
            const selected = option.id === slot
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSlot(option.id)}
                className={
                  'h-8 rounded-full px-4 text-12 transition-colors ' +
                  (selected
                    ? 'bg-bulb-100 text-bulb-500'
                    : 'bg-glass-200 text-glass-600 hover:text-glass-900')
                }
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <SourcePicker
        localStream={localStream}
        busy={working}
        shootHint="hold the garment up"
        onBlob={(blob, name) => void accept(blob, name)}
      />

      <p className={'text-12 ' + (slotDef(slot).caveat && !working ? 'text-alarm-700' : 'text-glass-600')}>
        {working
          ? busyLabel
          : (slotDef(slot).caveat ??
            'Photos of the garment on a person work better than flat-lays.')}
      </p>
    </Sheet>
  )
}
