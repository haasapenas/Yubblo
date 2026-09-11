import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { Button } from './Button'
import './EditButton.css'

function EditIcon(): ReactElement {
  return (
    <svg
      className="yb-edit-icon"
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </svg>
  )
}

type EditButtonProps = {
  children: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>

export function EditButton({
  children,
  className,
  ...rest
}: EditButtonProps): ReactElement {
  return (
    <Button variant="secondary" className={['yb-edit-btn', className].filter(Boolean).join(' ')} {...rest}>
      <EditIcon />
      {children}
    </Button>
  )
}
