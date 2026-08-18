import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

interface Shell {
  label: string
  icon?: ReactNode
  hint?: ReactNode
  /** A sentence. Renders in alarm below the control. */
  error?: string | null
}

function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }): JSX.Element {
  return (
    <label htmlFor={htmlFor} className="text-12 font-medium uppercase tracking-wide text-glass-600">
      {children}
    </label>
  )
}

const control =
  'w-full h-10 rounded bg-glass-000 border border-glass-200 px-3 text-14 text-glass-900 ' +
  'placeholder:text-glass-400 transition-colors hover:border-glass-400'

export type TextFieldProps = Shell & InputHTMLAttributes<HTMLInputElement>

export function TextField({ label, icon, hint, error, className = '', ...rest }: TextFieldProps): JSX.Element {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative flex items-center">
        {icon ? (
          <span className="pointer-events-none absolute left-3 flex h-5 w-5 items-center justify-center text-glass-600">
            {icon}
          </span>
        ) : null}
        <input id={id} className={control + (icon ? ' pl-10' : '') + ' ' + className} {...rest} />
      </div>
      {error ? <p className="text-12 text-alarm-700">{error}</p> : null}
      {!error && hint ? <p className="text-12 text-glass-600">{hint}</p> : null}
    </div>
  )
}

export type SelectFieldProps = Shell & SelectHTMLAttributes<HTMLSelectElement>

export function SelectField({
  label,
  icon,
  hint,
  error,
  className = '',
  children,
  ...rest
}: SelectFieldProps): JSX.Element {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative flex items-center">
        {icon ? (
          <span className="pointer-events-none absolute left-3 flex h-5 w-5 items-center justify-center text-glass-600">
            {icon}
          </span>
        ) : null}
        <select
          id={id}
          className={control + ' appearance-none font-mono' + (icon ? ' pl-10' : '') + ' ' + className}
          {...rest}
        >
          {children}
        </select>
      </div>
      {error ? <p className="text-12 text-alarm-700">{error}</p> : null}
      {!error && hint ? <p className="text-12 text-glass-600">{hint}</p> : null}
    </div>
  )
}

export interface SliderFieldProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  /** Rendered to the right of the label in mono. */
  readout: string
  hint?: ReactNode
  onChange: (value: number) => void
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  readout,
  hint,
  onChange
}: SliderFieldProps): JSX.Element {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className="tabular font-mono text-12 text-glass-900">{readout}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-glass-200 accent-bulb-500"
      />
      {hint ? <p className="text-12 text-glass-600">{hint}</p> : null}
    </div>
  )
}
