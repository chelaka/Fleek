import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ClipboardText, UploadSimple, VideoCamera } from '@phosphor-icons/react'
import { useToast } from '@/ui/Toast'
import { extensionFor, isSupportedImage, stripDataUrl } from '@/lib/image'

/**
 * The four ways an image gets into Fleek: dropped, browsed, shot with the
 * camera, or pasted. Garments and photos of the user arrive by exactly the
 * same routes, so the routes live here and each sheet says what to do with
 * what comes back.
 */

export interface SourcePickerProps {
  /** The live local preview, used by "Shoot it". */
  localStream: MediaStream | null
  /** True while the caller is uploading, which locks every source. */
  busy: boolean
  /**
   * A self-portrait should match the preview the person was looking at; a
   * garment held up to the lens should not, or the model reads it reversed.
   */
  mirrored?: boolean
  /** What the shutter button says under the icon. */
  shootHint: string
  onBlob: (blob: Blob, name: string) => void
}

export function SourcePicker({
  localStream,
  busy,
  mirrored = false,
  shootHint,
  onBlob
}: SourcePickerProps): JSX.Element {
  const toast = useToast()
  const [dragging, setDragging] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const shotVideoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (shotVideoRef.current) shotVideoRef.current.srcObject = localStream
  }, [localStream])

  const fromFiles = useCallback(
    (files: FileList | null): void => {
      const file = files?.[0]
      if (!file) return
      if (!isSupportedImage(file, file.name)) {
        toast.say('Fleek reads jpg, png and webp.', 'alarm')
        return
      }
      onBlob(file, file.name)
    },
    [onBlob, toast]
  )

  /** Three seconds is enough to hold something up, or to step back. */
  const shoot = useCallback((): void => {
    const video = shotVideoRef.current
    if (!video || !localStream) {
      toast.say('The camera is not open, so there is nothing to shoot.', 'alarm')
      return
    }

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
        toast.say('There was no frame to capture. Try again.', 'alarm')
        return
      }
      if (mirrored) {
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const base64 = stripDataUrl(canvas.toDataURL('image/png'))
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      onBlob(new Blob([bytes], { type: 'image/png' }), 'shot.png')
    }, 1000)
  }, [localStream, mirrored, onBlob, toast])

  const paste = useCallback(async (): Promise<void> => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (!type) continue
        const blob = await item.getType(type)
        onBlob(blob, 'pasted.' + extensionFor(blob))
        return
      }
      toast.say('There is no image on the clipboard. Copy a photo, then try again.', 'alarm')
    } catch {
      toast.say('Windows would not hand over the clipboard. Try dropping the file instead.', 'alarm')
    }
  }, [onBlob, toast])

  // Ctrl+V works anywhere in the sheet, which is how most people will do this.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      const file = Array.from(event.clipboardData?.files ?? [])[0]
      if (!file) return
      event.preventDefault()
      onBlob(file, file.name)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [onBlob])

  return (
    <div className="grid grid-cols-1 gap-3 sm:h-48 sm:grid-cols-3 sm:gap-4">
      <button
        type="button"
        disabled={busy}
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
          'flex min-h-16 flex-col items-center justify-center gap-2 rounded border border-dashed p-4 text-14 transition-colors sm:gap-3 ' +
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
        {countdown > 0 ? (
          <motion.span
            key={countdown}
            data-face="display"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative text-48 text-stage-900"
          >
            {countdown}
          </motion.span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={shoot}
            className="relative flex flex-col items-center gap-2 text-14 text-stage-600 hover:text-stage-900 sm:gap-3"
          >
            <VideoCamera size={24} />
            Shoot it
            <span className="text-12 text-stage-600">{shootHint}</span>
          </button>
        )}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void paste()}
        className="flex min-h-16 flex-col items-center justify-center gap-2 rounded border border-glass-200 p-4 text-14 text-glass-600 transition-colors hover:border-glass-400 hover:text-glass-900 sm:gap-3"
      >
        <ClipboardText size={24} />
        Paste
        <span className="text-12 text-glass-400">from the clipboard</span>
      </button>

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
    </div>
  )
}
