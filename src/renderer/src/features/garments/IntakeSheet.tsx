import { useCallback, useEffect, useRef, useState } from 'react'
import { platform } from '@/platform'
import { motion } from 'motion/react'
import { ClipboardText, UploadSimple, VideoCamera } from '@phosphor-icons/react'
import { DEFAULT_SLOT, SLOTS, slotDef, type GarmentInput, type SlotId } from '@shared/types'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/Toast'
import {
  blobToBase64,
  decodeImage,
  extensionFor,
  isSupportedImage,
  stripDataUrl,
  thumbnailBase64
} from '@/lib/image'
import { uploadGarmentImage } from '@/features/session/upload'

export interface IntakeSheetProps {
  open: boolean
  onClose: () => void
  /** The live local preview, used by "Shoot it". */
  localStream: MediaStream | null
  onAdd: (input: GarmentInput) => Promise<unknown>
}

type Busy = null | 'reading' | 'uploading' | 'countdown'

export function IntakeSheet({ open, onClose, localStream, onAdd }: IntakeSheetProps): JSX.Element {
  const toast = useToast()
  const [busy, setBusy] = useState<Busy>(null)
  const [countdown, setCountdown] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [slot, setSlot] = useState<SlotId>(DEFAULT_SLOT)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const shotVideoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (shotVideoRef.current) shotVideoRef.current.srcObject = localStream
  }, [localStream, open])

  useEffect(() => {
    if (!open) {
      setBusy(null)
      setCountdown(0)
      setDragging(false)
      setSlot(DEFAULT_SLOT)
    }
  }, [open])

  /**
   * The one path every input method funnels through: decode, thumbnail,
   * upload to fal, then hand the whole thing to the library.
   */
  const accept = useCallback(
    async (blob: Blob, name: string): Promise<void> => {
      try {
        setBusy('reading')
        const image = await decodeImage(blob)
        const thumbBase64 = thumbnailBase64(image)

        setBusy('uploading')
        const apiKey = await platform.getApiKey()
        if (!apiKey) {
          toast.say('Fleek has no fal API key. Add one in Settings.', 'alarm')
          return
        }

        const file = new File([blob], name, { type: blob.type || 'image/png' })
        const remoteUrl = await uploadGarmentImage(apiKey, file)

        await onAdd({
          name: name.replace(/\.[a-z0-9]+$/i, '') || 'Garment',
          slot,
          imageBase64: await blobToBase64(blob),
          imageExt: extensionFor(blob, name),
          thumbBase64,
          remoteUrl,
          width: image.width,
          height: image.height
        })

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

  const fromFiles = useCallback(
    (files: FileList | null): void => {
      const file = files?.[0]
      if (!file) return
      if (!isSupportedImage(file, file.name)) {
        toast.say('Fleek reads jpg, png and webp.', 'alarm')
        return
      }
      void accept(file, file.name)
    },
    [accept, toast]
  )

  /** Three seconds is enough to pick the garment up and hold it steady. */
  const shoot = useCallback((): void => {
    const video = shotVideoRef.current
    if (!video || !localStream) {
      toast.say('The camera is not open, so there is nothing to shoot.', 'alarm')
      return
    }

    setBusy('countdown')
    setCountdown(3)

    let remaining = 3
    const tick = window.setInterval(() => {
      remaining -= 1
      setCountdown(remaining)
      if (remaining > 0) return

      window.clearInterval(tick)
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx || !canvas.width) {
        setBusy(null)
        toast.say('There was no frame to capture. Try again.', 'alarm')
        return
      }
      // Not mirrored: the model should see the garment the right way round.
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const base64 = stripDataUrl(canvas.toDataURL('image/png'))
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      void accept(new Blob([bytes], { type: 'image/png' }), 'shot.png')
    }, 1000)
  }, [accept, localStream, toast])

  const paste = useCallback(async (): Promise<void> => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (!type) continue
        const blob = await item.getType(type)
        await accept(blob, 'pasted.' + extensionFor(blob))
        return
      }
      toast.say('There is no image on the clipboard. Copy a product photo, then try again.', 'alarm')
    } catch {
      toast.say('Windows would not hand over the clipboard. Try dropping the file instead.', 'alarm')
    }
  }, [accept, toast])

  // Ctrl+V works anywhere in the sheet, which is how most people will do this.
  useEffect(() => {
    if (!open) return
    const onPaste = (event: ClipboardEvent): void => {
      const file = Array.from(event.clipboardData?.files ?? [])[0]
      if (file) {
        event.preventDefault()
        void accept(file, file.name)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [open, accept])

  const working = busy === 'reading' || busy === 'uploading'
  const busyLabel = busy === 'uploading' ? 'Uploading to fal' : busy === 'reading' ? 'Reading' : ''

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

      <div className="grid h-48 grid-cols-3 gap-4">
        <button
          type="button"
          disabled={working}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            fromFiles(e.dataTransfer.files)
          }}
          className={
            'flex flex-col items-center justify-center gap-3 rounded border border-dashed p-4 text-14 transition-colors ' +
            (dragging
              ? 'border-bulb-500 bg-bulb-100 text-glass-900'
              : 'border-glass-400 text-glass-600 hover:border-glass-600 hover:text-glass-900')
          }
        >
          <UploadSimple size={24} />
          Drop or browse
          <span className="text-12 text-glass-400">jpg, png, webp</span>
        </button>

        <div className="relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded border border-glass-200 bg-glass-000">
          <video
            ref={shotVideoRef}
            autoPlay
            playsInline
            muted
            className="mirrored absolute inset-0 h-full w-full object-cover opacity-40"
          />
          {busy === 'countdown' ? (
            <motion.span
              key={countdown}
              data-face="display"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative text-48 text-glass-900"
            >
              {countdown}
            </motion.span>
          ) : (
            <button
              type="button"
              disabled={working}
              onClick={shoot}
              className="relative flex flex-col items-center gap-3 text-14 text-glass-600 hover:text-glass-900"
            >
              <VideoCamera size={24} />
              Shoot it
              <span className="text-12 text-glass-400">hold the garment up</span>
            </button>
          )}
        </div>

        <button
          type="button"
          disabled={working}
          onClick={() => void paste()}
          className="flex flex-col items-center justify-center gap-3 rounded border border-glass-200 p-4 text-14 text-glass-600 transition-colors hover:border-glass-400 hover:text-glass-900"
        >
          <ClipboardText size={24} />
          Paste
          <span className="text-12 text-glass-400">from the clipboard</span>
        </button>
      </div>

      <p className={'text-12 ' + (slotDef(slot).caveat && !working ? 'text-alarm-500' : 'text-glass-600')}>
        {working
          ? busyLabel
          : (slotDef(slot).caveat ??
            'Photos of the garment on a person work better than flat-lays.')}
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          fromFiles(e.currentTarget.files)
          e.currentTarget.value = ''
        }}
      />
    </Sheet>
  )
}
