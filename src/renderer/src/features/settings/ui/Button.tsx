import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import './Button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'danger'

type ButtonProps = {
  variant?: ButtonVariant
  children: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>

export function Button({
  variant = 'secondary',
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps): ReactElement {
  const classes = [
    'yb-btn',
    `yb-btn-${variant}`,
    variant === 'primary' ? 'yb-btn-glossy' : '',
    className ?? ''
  ].filter(Boolean).join(' ')
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  )
}
