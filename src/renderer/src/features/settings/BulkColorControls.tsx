import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { HighlightColorButton } from './highlights/HighlightColorPicker'
import { Button } from './ui/Button'
import { BulkColorButton } from './ui/BulkColorButton'

interface Props {
  active: boolean
  selectedCount: number
  disabled: boolean
  onToggle(): void
  onApply(color: string): void
  onClear(): void
}

export function BulkColorControls(props: Props): ReactElement {
  const { t } = useTranslation('settings')
  const label = t('bulkColors.change', { count: props.selectedCount })
  return <div className="bulk-color-controls" data-selected-count={props.selectedCount} data-active={props.active ? 'true' : 'false'}>
    <BulkColorButton active={props.active} onClick={props.onToggle}>
      {t('bulkColors.toggle')}
    </BulkColorButton>
    {props.active ? <>
      <HighlightColorButton
        value="#f5a52480"
        initialAlpha={128}
        disabled={props.disabled || props.selectedCount === 0}
        label={label}
        triggerContent={label}
        triggerClassName="yb-btn yb-btn-secondary"
        onConfirm={props.onApply}
      />
      {props.selectedCount > 0 ? <Button data-testid="bulk-clear" variant="secondary" className="bulk-color-clear" onClick={props.onClear}>{t('bulkColors.clear')}</Button> : null}
    </> : null}
  </div>
}
