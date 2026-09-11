import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { DeleteActionIcon } from '../../moderation/DeleteActionIcon'
import { Button } from './Button'
import './DeleteButton.css'

type DeleteButtonProps = {
  children: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>

export function DeleteButton({
  children,
  className,
  ...rest
}: DeleteButtonProps): ReactElement {
  return (
    <Button variant="danger" className={['yb-delete-btn', className].filter(Boolean).join(' ')} {...rest}>
      <DeleteActionIcon />
      {children}
    </Button>
  )
}
