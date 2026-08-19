import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { HighlightPreferences, HighlightRule } from '../../../../../shared/types'
import { HighlightColorButton } from './HighlightColorPicker'
import type { HighlightDraft } from './use-highlight-autosave'

interface Props {
  draft: HighlightDraft
  editingId: string | null
  selectedRuleIds: ReadonlySet<string>
  allSelected: boolean
  someSelected: boolean
  onEditingId(id: string | null): void
  onToggleRule(id: string): void
  onToggleAll(): void
  onRulePatch(id: string, patch: Partial<HighlightRule>, debounced?: boolean): void
  onSelfPatch(patch: Partial<HighlightPreferences>): void
  onRemove(id: string): void
}

export function HighlightRulesTable(props: Props): ReactElement {
  const { t } = useTranslation('settings')
  const [editValue, setEditValue] = useState('')
  const [originalValue, setOriginalValue] = useState('')
  const cancelBlurRef = useRef(false)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const { draft } = props

  useEffect(() => {
    if (!props.editingId) return
    const rule = draft.highlights.find((item) => item.id === props.editingId)
    if (rule) { setEditValue(rule.pattern); setOriginalValue(rule.pattern) }
  }, [props.editingId, draft.highlights])

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = props.someSelected
  }, [props.someSelected])

  function beginEdit(rule: HighlightRule): void {
    cancelBlurRef.current = false; setEditValue(rule.pattern); setOriginalValue(rule.pattern); props.onEditingId(rule.id)
  }
  function finish(id: string, cancel = false): void {
    if (cancel) cancelBlurRef.current = true
    if (cancelBlurRef.current && !cancel) { cancelBlurRef.current = false; return }
    const pattern = editValue.trim()
    if (!cancel && pattern && pattern !== originalValue) props.onRulePatch(id, { pattern }, true)
    props.onEditingId(null)
  }
  function onEditorKey(event: KeyboardEvent<HTMLInputElement>, id: string): void {
    if (event.key === 'Enter') { event.preventDefault(); finish(id) }
    if (event.key === 'Escape') { event.preventDefault(); setEditValue(originalValue); finish(id, true) }
  }
  const box = (rule: HighlightRule, field: 'enabled' | 'playSound', label: string): ReactElement =>
    <input aria-label={`${rule.pattern} ${label}`} type="checkbox" checked={rule[field] === true} onChange={(event) => props.onRulePatch(rule.id, { [field]: event.target.checked })} />

  return <div className="highlight-rules-table-wrap"><table className="highlight-rules-table">
    <thead><tr><th className="hl-select-cell"><input
      ref={selectAllRef}
      data-testid="bulk-select-all-highlights"
      type="checkbox"
      aria-label={t('bulkColors.selectAllHighlights')}
      checked={props.allSelected}
      onChange={props.onToggleAll}
    /></th><th>{t('highlightRules.columns.pattern')}</th><th className="hl-option-cell">{t('highlightRules.columns.on')}</th><th className="hl-option-cell">{t('highlightRules.columns.sound')}</th><th className="hl-color-cell">{t('highlightRules.columns.color')}</th><th className="hl-row-actions" /></tr></thead>
    <tbody>
      <tr className={draft.highlightPreferences.selfEnabled ? '' : 'disabled'}>
        <td className="hl-select-cell" />
        <td className="hl-rule-pattern">{t('highlightRules.selfRule')}</td>
        <td className="hl-option-cell"><input aria-label={t('highlightRules.selfRule')} type="checkbox" checked={draft.highlightPreferences.selfEnabled} onChange={(event) => props.onSelfPatch({ selfEnabled: event.target.checked })} /></td>

        <td className="hl-option-cell"><input aria-label={`${t('highlightRules.selfRule')} ${t('highlightRules.columns.sound')}`} type="checkbox" checked={draft.highlightPreferences.selfPlaySound} onChange={(event) => props.onSelfPatch({ selfPlaySound: event.target.checked })} /></td>
        <td className="hl-color-cell"><HighlightColorButton value={draft.highlightPreferences.selfColor} label={`${t('highlightRules.selfRule')} ${t('highlightRules.columns.color')}`} onConfirm={(color) => props.onSelfPatch({ selfColor: color })} /></td><td />
      </tr>
      {draft.highlights.map((rule) => <tr key={rule.id} className={rule.enabled ? '' : 'disabled'}>
        <td className="hl-select-cell"><input
          type="checkbox"
          data-select-rule-id={rule.id}
          aria-label={t('bulkColors.selectRule', { rule: rule.pattern })}
          checked={props.selectedRuleIds.has(rule.id)}
          onChange={() => props.onToggleRule(rule.id)}
        /></td>
        <td className="hl-rule-pattern" onDoubleClick={() => beginEdit(rule)}>{props.editingId === rule.id
          ? <input data-testid="pattern-editor" className="hl-pattern-editor" autoFocus value={editValue} onChange={(event) => setEditValue(event.target.value)} onKeyDown={(event) => onEditorKey(event, rule.id)} onBlur={() => finish(rule.id)} />
          : <span data-testid={`pattern-${rule.id}`}>{rule.pattern || t('highlightRules.emptyPattern')}</span>}</td>
        <td className="hl-option-cell">{box(rule, 'enabled', t('highlightRules.enabled'))}</td>
        <td className="hl-option-cell">{box(rule, 'playSound', t('highlightRules.columns.sound'))}</td>
        <td className="hl-color-cell"><HighlightColorButton value={rule.color} label={`${rule.pattern} ${t('highlightRules.columns.color')}`} onConfirm={(color) => props.onRulePatch(rule.id, { color })} /></td>
        <td className="hl-row-actions"><button type="button" title={t('highlightRules.remove')} onClick={() => props.onRemove(rule.id)}>×</button></td>
      </tr>)}
    </tbody>
  </table></div>
}
