import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

export interface Toast {
  id: number
  message: string
  tone: 'plain' | 'alarm'
}

interface ToastApi {
  /** Messages are sentences. They explain what happened and what to do. */
  say: (message: string, tone?: Toast['tone']) => void
}

const ToastContext = createContext<ToastApi>({ say: () => undefined })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}

const LIFETIME_MS = 5000

export function ToastHost({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])
  const reduced = useReducedMotion()

  const say = useCallback((message: string, tone: Toast['tone'] = 'plain') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), LIFETIME_MS)
  }, [])

  const api = useMemo(() => ({ say }), [say])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none absolute bottom-24 left-1/2 z-30 flex w-full max-w-full -translate-x-1/2 flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24 }}
              className={
                'pointer-events-auto mx-4 max-w-[480px] rounded bg-glass-100 px-4 py-3 text-14 shadow-hud ' +
                (toast.tone === 'alarm' ? 'text-alarm-700' : 'text-glass-900')
              }
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
