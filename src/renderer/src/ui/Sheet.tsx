import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from '@phosphor-icons/react'
import { IconButton } from './Button'

export interface SheetProps {
  open: boolean
  title: string
  onClose: () => void
  /** Sheets are 320px unless they hold a form, which grows to fit. */
  size?: 'intake' | 'settings'
  children: ReactNode
}

/**
 * A sheet slides up from the tray rather than replacing the mirror, because
 * the reflection is the product and covering it is a cost.
 */
export function Sheet({ open, title, onClose, size = 'intake', children }: SheetProps): JSX.Element {
  const reduced = useReducedMotion()
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
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.12 } }
    : {
        initial: { y: '100%' },
        animate: { y: 0 },
        exit: { y: '100%' },
        transition: { type: 'spring' as const, stiffness: 300, damping: 30 }
      }

  return (
    <AnimatePresence>
      {open ? (
        <div className="absolute inset-0 z-20 flex flex-col justify-end">
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
              'relative flex flex-col gap-4 rounded-t-sheet border-t border-glass-200 bg-glass-100 p-6 ' +
              // Both sheets grow to fit and stop at 80% of the mirror, which
              // is the point where covering the reflection starts to cost.
              (size === 'intake' ? 'max-h-[80%]' : 'max-h-[80%] overflow-y-auto')
            }
            {...enter}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-16 font-medium text-glass-900">{title}</h2>
              <IconButton aria-label="Close" icon={<X size={20} />} onClick={onClose} />
            </div>
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
