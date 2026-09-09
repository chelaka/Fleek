import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from '@phosphor-icons/react'
import { WIDE, useMediaQuery } from '@/lib/useMediaQuery'
import { IconButton } from './Button'

export interface SheetProps {
  open: boolean
  title: string
  /** One line under the title. Says what the sheet is for. */
  subtitle?: string
  onClose: () => void
  /** How wide the desktop dialog is. Forms need more room than intake. */
  size?: 'intake' | 'settings'
  children: ReactNode
}

/**
 * One dialog, two shapes.
 *
 * On a phone it is a sheet: it comes up from the bottom edge, under the
 * thumb, and keeps the top of the mirror visible. On a desktop a sheet
 * pinned to the bottom of a 1400px window is a long way from the pointer and
 * a long way from the thing it is about, so the same content becomes a
 * centred dialog instead. The two need different keyframes, not different
 * classes, which is the one thing Tailwind cannot decide for us.
 */
export function Sheet({
  open,
  title,
  subtitle,
  onClose,
  size = 'intake',
  children
}: SheetProps): JSX.Element {
  const reduced = useReducedMotion()
  const wide = useMediaQuery(WIDE)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return

      // A sheet is modal, so the keyboard path stays inside it.
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    // Give the sheet focus so Escape and Tab land here immediately.
    window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>('button, input, select')?.focus()
    })
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const enter = reduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.12 }
      }
    : wide
      ? {
          initial: { opacity: 0, scale: 0.96, y: 8 },
          animate: { opacity: 1, scale: 1, y: 0 },
          exit: { opacity: 0, scale: 0.98, y: 8 },
          transition: { type: 'spring' as const, stiffness: 420, damping: 34 }
        }
      : {
          initial: { y: '100%' },
          animate: { y: 0 },
          exit: { y: '100%' },
          transition: { type: 'spring' as const, stiffness: 300, damping: 30 }
        }

  return (
    <AnimatePresence>
      {open ? (
        <div className="absolute inset-0 z-20 flex flex-col justify-end sm:items-center sm:justify-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-[var(--scrim)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={
              'relative flex max-h-[88%] w-full flex-col rounded-t-sheet bg-glass-100 shadow-sheet ' +
              'sm:max-h-full sm:rounded-sheet ' +
              (size === 'settings' ? 'sm:max-w-[640px]' : 'sm:max-w-[560px]')
            }
            {...enter}
          >
            <header className="flex flex-none items-start justify-between gap-4 p-4 pb-3 sm:p-6 sm:pb-4">
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="text-16 font-medium text-glass-900">{title}</h2>
                {subtitle ? <p className="text-12 text-glass-600">{subtitle}</p> : null}
              </div>
              <IconButton aria-label="Close" icon={<X size={20} />} onClick={onClose} />
            </header>

            {/* The header stays put and the body scrolls, so Close is always
                where you left it however long the form is. */}
            <div className="scroll-y flex min-h-0 flex-col gap-4 px-4 pb-4 sm:px-6 sm:pb-6">
              {children}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
