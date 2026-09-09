import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ClipboardText, UploadSimple, VideoCamera, X } from '@phosphor-icons/react'
import { useToast } from '@/ui/Toast'
import { extensionFor, isSupportedImage, stripDataUrl } from '@/lib/image'

/**
 * The four ways an image gets into Fleek: dropped, browsed, shot with the
 * camera, or pasted. Garments and photos of the user arrive by exactly the
 * same routes, so the routes live here and each sheet says what to do with
 * what comes back.
 *
 * They are not four equal buttons, because they are not four equal answers.
 * Almost everyone has the image on disk or on the clipboard already, so
 * dropping gets the whole stage and the other two sit under it. The camera
 * borrows that stage when you ask for it rather than living in a third of it
 * permanently, which is also the only way the countdown gets big enough to
 * read from arm's length.
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
  const [shooting, setShooting] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const shotVideoRef = useRef<HTMLVideoElement>(null)
  const tickRef = useRef(0)

  useEffect(() => {
    if (shotVideoRef.current) shotVideoRef.current.srcObject = localStream
  }, [localStream, shooting])

  // A countdown left running after the sheet closes would fire into nothing.
  useEffect(() => () => window.clearInterval(tickRef.current), [])

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

  const cancelShoot = useCallback((): void => {
    window.clearInterval(tickRef.current)
    setCountdown(0)
    setShooting(false)
  }, [])

  /** Three seconds is enough to hold something up, or to step back. */
  const shoot = useCallback((): void => {
    if (!localStream) {
      toast.say('The camera is not open, so there is nothing to shoot.', 'alarm')
      return
    }

    setShooting(true)
    setCountdown(3)
    let remaining = 3
    tickRef.current = window.setInterval(() => {
      remaining -= 1
      setCountdown(remaining)
      if (remaining > 0) return

      window.clearInterval(tickRef.current)
      const video = shotVideoRef.current
      const canvas = document.createElement('canvas')
      canvas.width = video?.videoWidth ?? 0
      canvas.height = video?.videoHeight ?? 0
      const ctx = canvas.getContext('2d')
      if (!video || !ctx || !canvas.width) {
        toast.say('There was no frame to capture. Try again.', 'alarm')
        cancelShoot()
        return
      }
      if (mirrored) {
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const base64 = stripDataUrl(canvas.toDataURL('image/png'))
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      setShooting(false)
      setCountdown(0)
      onBlob(new Blob([bytes], { type: 'image/png' }), 'shot.png')
    }, 1000)
  }, [cancelShoot, localStream, mirrored, onBlob, toast])

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
      toast.say('This browser would not hand over the clipboard. Try dropping the file instead.', 'alarm')
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
    <div className="flex flex-col gap-3">
      {/* The spacing scale stops at 96px, and the stage wants to be taller
          than a thumbnail, so these two are spelled out. */}
      <div className="relative h-[160px] overflow-hidden rounded-lg sm:h-[192px]">
        <AnimatePresence initial={false} mode="wait">
          {shooting ? (
            <motion.div
              key="camera"
              className="absolute inset-0 flex items-center justify-center bg-stage-000"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              <video
                ref={shotVideoRef}
                autoPlay
                playsInline
                muted
                className={
                  'absolute inset-0 h-full w-full object-cover opacity-60 ' +
                  (mirrored ? 'mirrored' : '')
                }
              />
              <motion.span
                key={countdown}
                data-face="display"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                className="relative text-48 text-stage-900"
              >
                {countdown}
              </motion.span>
              <button
                type="button"
                onClick={cancelShoot}
                aria-label="Cancel the countdown"
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-glass-100 text-glass-900 transition-colors hover:bg-alarm-500"
              >
                <X size={16} />
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="drop"
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className={
                'absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg ' +
                'border border-dashed text-14 transition-colors disabled:cursor-not-allowed ' +
                (dragging
                  ? 'border-bulb-500 bg-bulb-100 text-glass-900'
                  : 'border-glass-400 bg-glass-000 text-glass-600 hover:border-bulb-500 hover:text-glass-900')
              }
            >
              <UploadSimple size={32} />
              <span className="font-medium text-glass-900">Drop an image here</span>
              <span className="text-12 text-glass-600">or click to browse · jpg, png, webp</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={busy || shooting}
          onClick={shoot}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-glass-200 px-4 text-14 text-glass-900 transition-colors hover:bg-glass-400 disabled:cursor-not-allowed disabled:text-glass-400 sm:h-10"
          title={shootHint}
        >
          <VideoCamera size={20} />
          Shoot it
        </button>
        <button
          type="button"
          disabled={busy || shooting}
          onClick={() => void paste()}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-glass-200 px-4 text-14 text-glass-900 transition-colors hover:bg-glass-400 disabled:cursor-not-allowed disabled:text-glass-400 sm:h-10"
          title="Anything on the clipboard, or just press Ctrl+V"
        >
          <ClipboardText size={20} />
          Paste
        </button>
      </div>

      {shooting ? <p className="text-12 text-glass-600">{shootHint}</p> : null}

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
