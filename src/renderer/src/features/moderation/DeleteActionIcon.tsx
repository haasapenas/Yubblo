import type { ReactElement } from 'react'

export function DeleteActionIcon(): ReactElement {
  return (
    <svg
      className="delete-action-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="2 2 20 20"
      fill="none"
      width="12"
      height="12"
      focusable="false"
      aria-hidden="true"
    >
      <path
        d="M10 11V17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11V17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 7H20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 7H12H18V18C18 19.6569 16.6569 21 15 21H9C7.34315 21 6 19.6569 6 18V7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V7H9V5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function BanActionIcon(): ReactElement {
  return (
    <svg
      className="ban-action-icon"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width="12"
      height="12"
      focusable="false"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M16 5C9.935 5 5 9.934 5 16c0 6.067 4.935 11 11 11s11-4.933 11-11c0-6.066-4.935-11-11-11zm0 2.75c1.777 0 3.427.569 4.775 1.53L9.279 20.778A8.214 8.214 0 0 1 7.75 16c0-4.549 3.701-8.25 8.25-8.25zm0 16.5a8.2 8.2 0 0 1-4.775-1.53l11.494-11.497A8.205 8.205 0 0 1 24.25 16c0 4.547-3.701 8.25-8.25 8.25z"
      />
    </svg>
  )
}

export function actionButtonFace(
  kind: string,
  label: string,
  busy = false
): ReactElement | string {
  if (busy) return '…'
  if (kind === 'delete') return <DeleteActionIcon />
  if (kind === 'hide') return <BanActionIcon />
  return label
}
