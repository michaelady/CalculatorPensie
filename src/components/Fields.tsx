import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

interface FieldProps {
  label: string
  hint?: string
  children: ReactNode
  htmlFor?: string
}

export function Field({ label, hint, children, htmlFor }: FieldProps) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
  label: string
  hint?: string
  value: number | ''
  onChange: (v: number) => void
  suffix?: string
}

export function NumberField({
  label,
  hint,
  value,
  onChange,
  suffix,
  id: idProp,
  ...rest
}: NumberFieldProps) {
  const gen = useId()
  const id = idProp ?? gen
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="input-with-suffix">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value === '' ? '' : value}
          onChange={(e) => {
            const n = e.target.value === '' ? 0 : Number(e.target.value)
            onChange(Number.isNaN(n) ? 0 : n)
          }}
          {...rest}
        />
        {suffix ? <span className="suffix">{suffix}</span> : null}
      </div>
    </Field>
  )
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
}

export function TextField({ label, hint, value, onChange, id: idProp, ...rest }: TextFieldProps) {
  const gen = useId()
  const id = idProp ?? gen
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </Field>
  )
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}

export function SelectField({
  label,
  hint,
  value,
  onChange,
  options,
  id: idProp,
  ...rest
}: SelectFieldProps) {
  const gen = useId()
  const id = idProp ?? gen
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}
