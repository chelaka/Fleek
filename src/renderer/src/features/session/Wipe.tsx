import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

/**
 * The signature moment: a soft band of light sweeps down the glass whenever a
 * garment is applied. It reads as wiping condensation off a mirror, and it
 * earns its place by covering the real latency of the model picking up a new
 * reference image.
 *
 * Under reduced motion there is no sweep -- just a short fade of the same
 * light, so the change is still announced without anything travelling.
 */
export function Wipe({ trigger }: { trigger: number }): JSX.Element {
  const reduced = useReducedMotion()

  return (
    <AnimatePresence>
      {trigger > 0 ? (
        <motion.div
          key={trigger}
          className="pointer-events-none absolute inset-0 z-10"
          aria-hidden
          initial={reduced ? { opacity: 0 } : { y: '-100%', opacity: 1 }}
          animate={reduced ? { opacity: [0, 1, 0] } : { y: '100%', opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.12 : 0.48, ease: [0.22, 1, 0.36, 1] }}
          style={{ background: 'var(--wipe-band)' }}
        />
      ) : null}
    </AnimatePresence>
  )
}
