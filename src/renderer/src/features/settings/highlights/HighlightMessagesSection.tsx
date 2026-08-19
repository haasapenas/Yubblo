import { useRef, useState, type ChangeEvent, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { HighlightPreferences, HighlightRule } from '../../../../../shared/types'
import { appendHighlightRule, createHighlightRule, patchHighlightRule, removeHighlightRule } from './highlight-rule-operations'
import {
  exportExtensionHighlightJson,
  mergeHighlightImport,
  parseHighlightImport
} from './highlight-transfer'
import { HighlightRulesTable } from './HighlightRulesTable'
import { BulkColorControls } from '../BulkColorControls'
import type { HighlightDraft, SaveMode } from './use-highlight-autosave'
import { useHighlightAutosave } from './use-highlight-autosave'

interface Props {
  initial: HighlightDraft
  onSave(draft: HighlightDraft): Promise<HighlightDraft>
}

function download(content: string, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function HighlightMessagesSection(props: Props): ReactElement {
  const { t } = useTranslation('settings')
  const importRef = useRef<HTMLInputElement>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState(false)
  const [transferStatus, setTransferStatus] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(() => new Set())
  const autosave = useHighlightAutosave(props.initial, async (draft) => {
    const saved = await props.onSave(draft); setSaveError(false); return saved
  }, () => setSaveError(true))
  const draft = autosave.draft
  const normalizedFilter = filter.trim().toLocaleLowerCase()
  const filteredHighlights = normalizedFilter
    ? draft.highlights.filter((rule) =>
        rule.pattern.toLocaleLowerCase().includes(normalizedFilter)
      )
    : draft.highlights
  const allRuleIds = draft.highlights.map((rule) => rule.id)
  const allSelected = allRuleIds.length > 0 && allRuleIds.every((id) => selectedRuleIds.has(id))
  const someSelected = selectedRuleIds.size > 0 && !allSelected
  function update(next: HighlightDraft, mode: SaveMode = 'immediate'): void { autosave.update(next, mode) }
  function updateRule(id: string, patch: Partial<HighlightRule>, debounced = false): void {
    update({ ...draft, highlights: patchHighlightRule(draft.highlights, id, patch) }, debounced ? 'debounced' : 'immediate')
  }
  function updatePreferences(patch: Partial<HighlightPreferences>): void {
    update({ ...draft, highlightPreferences: { ...draft.highlightPreferences, ...patch } })
  }
  function addRule(): void {
    const rule = { ...createHighlightRule(), pattern: t('highlightRules.newPattern') }
    update({ ...draft, highlights: appendHighlightRule(draft.highlights, rule) })
    setEditingId(rule.id)
  }
  function toggleRule(id: string): void {
    setSelectedRuleIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleAllRules(): void {
    setSelectedRuleIds(allSelected ? new Set() : new Set(allRuleIds))
  }
  function applyBulkColor(color: string): void {
    update({
      ...draft,
      highlights: draft.highlights.map((rule) =>
        selectedRuleIds.has(rule.id) ? { ...rule, color } : rule)
    })
    setSelectedRuleIds(new Set())
  }
  function removeRule(id: string): void {
    update({ ...draft, highlights: removeHighlightRule(draft.highlights, id) })
    setSelectedRuleIds((current) => {
      const next = new Set(current); next.delete(id); return next
    })
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const imported = parseHighlightImport(await file.text())
      update(mergeHighlightImport(draft, imported))
      setTransferStatus(t('highlightRules.transfer.imported', { count: imported.rules.length }))
    } catch {
      setTransferStatus(t('highlightRules.transfer.importError'))
    } finally {
      input.value = ''
    }
  }
  function exportHighlights(): void {
    if (!draft.highlights.length) return
    download(exportExtensionHighlightJson(draft.highlights), 'application/json;charset=utf-8', t('highlightRules.transfer.jsonFilename'))
  }
  return <section className="settings-section highlight-messages-section">
    <div className="hl-section-heading">
      <div><h3>{t('highlightRules.messages')}</h3><p className="settings-hint">{t('highlightRules.help')}</p></div>
      <div className="hl-heading-actions">
        <BulkColorControls
          selectedCount={selectedRuleIds.size}
          disabled={autosave.saving}
          onApply={applyBulkColor}
          onClear={() => setSelectedRuleIds(new Set())}
        />
        <input ref={importRef} className="hl-import-input" type="file" accept=".txt,.json,text/plain,application/json" onChange={(event) => { void importFile(event) }} />
        <button type="button" className="btn" onClick={() => importRef.current?.click()}>{t('highlightRules.transfer.import')}</button>
        <button type="button" className="btn" onClick={exportHighlights}>{t('highlightRules.transfer.export')}</button>
        <button data-testid="highlight-add" type="button" className="btn btn-primary" onClick={addRule}>+ {t('highlightRules.add')}</button>
      </div>
    </div>
    <input
      data-testid="highlight-filter"
      className="hl-filter"
      value={filter}
      onChange={(event) => setFilter(event.target.value)}
      placeholder={t('highlightRules.filterPlaceholder')}
      spellCheck={false}
    />
    {saveError && <div className="hl-save-error">{t('highlightRules.saveError')}</div>}
    {transferStatus && <div className="hl-transfer-status">{transferStatus}</div>}
    <HighlightRulesTable
      draft={{ ...draft, highlights: filteredHighlights }}
      editingId={editingId}
      selectedRuleIds={selectedRuleIds}
      allSelected={allSelected}
      someSelected={someSelected}
      onEditingId={setEditingId}
      onToggleRule={toggleRule}
      onToggleAll={toggleAllRules}
      onRulePatch={updateRule}
      onSelfPatch={updatePreferences}
      onRemove={removeRule}
    />
    <div className="hl-save-status">{autosave.saving ? t('highlightRules.saving') : t('highlightRules.saved')}</div>
  </section>
}
