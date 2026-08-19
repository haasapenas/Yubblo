import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { HighlightColorButton } from './highlights/HighlightColorPicker'

interface Props {
  selectedCount: number
  disabled: boolean
  onApply(color: string): void
  onClear(): void
}

export function BulkColorControls(props: Props): ReactElement {
  const { t } = useTranslation('settings')
  const label = t('bulkColors.change', { count: props.selectedCount })
  return <div className="bulk-color-controls" data-selected-count={props.selectedCount}>
    <HighlightColorButton
      value="#f5a52480"
      initialAlpha={128}
      disabled={props.disabled || props.selectedCount === 0}
      label={label}
      triggerContent={label}
      triggerClassName="btn"
      onConfirm={props.onApply}
    />
    {props.selectedCount > 0 && <button
      data-testid="bulk-clear"
      type="button"
      className="btn bulk-color-clear"
      onClick={props.onClear}
    >{t('bulkColors.clear')}</button>}
  </div>
}
