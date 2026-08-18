import { motion, useReducedMotion } from 'motion/react'
import type { StatusWord } from '@/features/session/machine'

const TONE: Record<StatusWord, string> = {
  ready: 'var(--glass-400)',
  connecting: 'var(--glass-600)',
  live: 'var(--bulb-500)',
  reconnecting: 'var(--glass-600)',
  stopped: 'var(--glass-400)'
}

/**
 * An 8px dot and one word. This is the whole connection indicator, and during
 * `live` there is no way to hide it -- the user should always be able to see
 * that video is leaving the machine.
 */
export function StatusDot({ status }: { status: StatusWord }): JSX.Element {
  const reduced = useReducedMotion()
  const breathing = status === 'live' && !reduced

  return (
    <div className="flex items-center gap-2 text-12 text-glass-600">
      <motion.span
        className="block h-1 w-1 rounded-full"
        style={{ width: 8, height: 8, background: TONE[status] }}
        animate={breathing ? { opacity: [1, 0.55, 1] } : { opacity: 1 }}
        transition={breathing ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.12 }}
      />
      <span className={status === 'live' ? 'text-bulb-500' : undefined}>{status}</span>
    </div>
  )
}
