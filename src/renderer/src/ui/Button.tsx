import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'> {
  variant?: Variant
  /** Rendered before the label at 20px. */
  icon?: ReactNode
  children?: ReactNode
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-full px-5 h-10 text-14 font-medium ' +
  'transition-colors no-drag disabled:cursor-not-allowed select-none'

const variants: Record<Variant, string> = {
  // Amber is reserved: the primary action is one of the four places it appears.
  primary:
    'bg-bulb-500 text-glass-000 hover:brightness-110 disabled:bg-glass-200 disabled:text-glass-400',
  secondary:
    'bg-glass-200 text-glass-900 hover:bg-glass-100 disabled:text-glass-400 disabled:bg-glass-200',
  ghost:
    'bg-transparent text-glass-600 hover:text-glass-900 disabled:text-glass-400',
  danger:
    'bg-transparent text-alarm-500 border border-glass-200 hover:bg-glass-100 disabled:text-glass-400'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', icon, children, className = '', disabled, ...rest },
  ref
) {
  const reduced = useReducedMotion()

  return (
    <motion.button
      ref={ref}
      type="button"
      disabled={disabled}
      whileTap={reduced || disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.09, ease: [0.22, 1, 0.36, 1] }}
      className={base + ' ' + variants[variant] + ' ' + className}
      {...rest}
    >
      {icon}
      {children}
    </motion.button>
  )
})

/** Icon-only. Always carries an aria-label; the type makes it non-optional. */
export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'icon'> {
  'aria-label': string
  icon: ReactNode
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, className = '', variant = 'ghost', disabled, ...rest },
  ref
) {
  const reduced = useReducedMotion()

  return (
    <motion.button
      ref={ref}
      type="button"
      disabled={disabled}
      whileTap={reduced || disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.09, ease: [0.22, 1, 0.36, 1] }}
      className={
        'inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors no-drag ' +
        'disabled:cursor-not-allowed ' +
        variants[variant] +
        ' ' +
        className
      }
      {...rest}
    >
      {icon}
    </motion.button>
  )
})
