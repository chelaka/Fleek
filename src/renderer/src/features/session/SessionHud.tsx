import { motion, useReducedMotion } from 'motion/react'
import { Meter, RollingNumerals } from '@/ui/Meter'
import { formatCost, formatElapsed } from './machine'
import type { SessionMeter } from './useSession'

export interface SessionHudProps {
  meter: SessionMeter
  capSeconds: number
  /** Shakes once, and only once, when a session fails. */
  shake: boolean
}

/**
 * Elapsed time, running cost, and the bar toward the cap. There is no way to
 * hide this -- the cost is not something to be tactful about.
 */
export function SessionHud({ meter, capSeconds, shake }: SessionHudProps): JSX.Element {
  const reduced = useReducedMotion()

  const rows = { hidden: { opacity: 0, y: reduced ? 0 : 8 }, shown: { opacity: 1, y: 0 } }

  return (
    <motion.div
      className="pointer-events-none absolute bottom-4 right-4 flex w-36 flex-col gap-2 rounded bg-glass-100 p-3 shadow-hud sm:bottom-6 sm:right-6 sm:w-40 sm:gap-3 sm:p-4"
      initial="hidden"
      animate={shake && !reduced ? { x: [0, -4, 4, -4, 0], opacity: 1, y: 0 } : 'shown'}
      exit={{ opacity: 0 }}
      variants={rows}
      transition={
        shake && !reduced
          ? { duration: 0.2, times: [0, 0.25, 0.5, 0.75, 1] }
          : { duration: 0.24, staggerChildren: 0.04, ease: [0.22, 1, 0.36, 1] }
      }
      role="status"
      aria-live="off"
    >
      <motion.div variants={rows} className="flex items-baseline justify-between">
        <span className="text-12 text-glass-600">elapsed</span>
        <RollingNumerals
          value={formatElapsed(meter.seconds)}
          className={'text-16 ' + (meter.warning ? 'text-bulb-700' : 'text-glass-900')}
        />
      </motion.div>

      <motion.div variants={rows} className="flex items-baseline justify-between">
        <span className="text-12 text-glass-600">cost</span>
        <RollingNumerals
          value={formatCost(meter.cost)}
          className={'text-16 ' + (meter.warning ? 'text-bulb-700' : 'text-glass-900')}
        />
      </motion.div>

      <motion.div variants={rows}>
        <Meter
          progress={meter.progress}
          warning={meter.warning}
          label={'Session time used, out of ' + capSeconds + ' seconds'}
        />
      </motion.div>
    </motion.div>
  )
}
