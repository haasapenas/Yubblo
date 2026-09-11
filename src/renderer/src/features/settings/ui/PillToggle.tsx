import type { ButtonHTMLAttributes, ReactElement } from 'react'
import './PillToggle.css'

type PillToggleProps = {
  checked: boolean
  onChange: (checked: boolean) => void
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'role' | 'type' | 'aria-checked'>

export function PillToggle({
  checked,
  disabled,
  onChange,
  className,
  ...rest
}: PillToggleProps): ReactElement {
  return (
    <button
      {...rest}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`yb-pill-toggle${checked ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      onClick={() => onChange(!checked)}
    />
  )
}
