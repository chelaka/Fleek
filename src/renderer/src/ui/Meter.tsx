import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

export interface MeterProps {
  /** 0 to 1. */
  progress: number
  /** Past 80% the bar goes amber, slowly enough to notice. */
  warning: boolean
  label: string
}

/** The thin bar under the HUD numerals, running toward the hard cap. */
export function Meter({ progress, warning, label }: MeterProps): JSX.Element {
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-glass-200"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: Math.min(100, progress * 100) + '%',
          background: warning ? 'var(--bulb-500)' : 'var(--glass-400)',
          transition: 'background-color var(--dur-cap-warn) linear, width 200ms linear'
        }}
      />
    </div>
  )
}

export interface RollingNumeralsProps {
  /** Already formatted. Mono and tabular, so nothing reflows as digits roll. */
  value: string
  className?: string
}

/** Each glyph rolls independently when it changes. */
export function RollingNumerals({ value, className = '' }: RollingNumeralsProps): JSX.Element {
  const reduced = useReducedMotion()

  if (reduced) {
    return <span className={'tabular font-mono ' + className}>{value}</span>
  }

  return (
    <span className={'tabular inline-flex font-mono ' + className} aria-label={value}>
      {value.split('').map((char, index) => (
        <span key={index} className="relative inline-block overflow-hidden" aria-hidden>
          {/* Reserves the glyph box so the roll never changes the layout. */}
          <span className="invisible">{char}</span>
          <AnimatePresence initial={false}>
            <motion.span
              key={char}
              className="absolute inset-0"
              initial={{ y: '-100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {char}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  )
}
