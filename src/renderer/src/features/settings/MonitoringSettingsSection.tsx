import { useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { MonitoringSettings } from '../../../../shared/types'
import { monitoredUserKey, normalizeMonitoringName } from '../../../../shared/monitoring'
import { HighlightColorButton } from './highlights/HighlightColorPicker'
import { BulkColorControls } from './BulkColorControls'

interface Props {
  monitoring: MonitoringSettings
  busy: boolean
  onChange(next: MonitoringSettings): void
}

export function MonitoringSettingsSection({
  monitoring,
  busy,
  onChange
}: Props): ReactElement {
  const { t } = useTranslation('settings')
  const [name, setName] = useState('')
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)
  const normalizedName = normalizeMonitoringName(name)
  const allKeys = monitoring.users.map(monitoredUserKey)
  const allSelected = allKeys.length > 0 && allKeys.every((key) => selectedKeys.has(key))
  const someSelected = selectedKeys.size > 0 && !allSelected

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected
  }, [someSelected])

  function addManualUser(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!normalizedName) return
    const duplicate = monitoring.users.some((user) =>
      !user.channelId && normalizeMonitoringName(user.name) === normalizedName)
    if (duplicate) return
    onChange({
      ...monitoring,
      users: [...monitoring.users, { name: normalizedName }]
    })
    setName('')
  }

  function toggleUser(key: string): void {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function toggleAllUsers(): void {
    setSelectedKeys(allSelected ? new Set() : new Set(allKeys))
  }

  function applyBulkColor(color: string): void {
    onChange({
      ...monitoring,
      users: monitoring.users.map((user) =>
        selectedKeys.has(monitoredUserKey(user)) ? { ...user, color } : user)
    })
    setSelectedKeys(new Set())
  }

  function removeUser(key: string): void {
    onChange({
      ...monitoring,
      users: monitoring.users.filter((item) => monitoredUserKey(item) !== key)
    })
    setSelectedKeys((current) => {
      const next = new Set(current); next.delete(key); return next
    })
  }

  return (
    <section className="settings-section monitoring-settings-section">
      <div className="monitoring-heading">
        <div>
          <h3>{t('monitoring.title')}</h3>
          <p className="settings-hint">{t('monitoring.help')}</p>
        </div>
        <BulkColorControls
          selectedCount={selectedKeys.size}
          disabled={busy}
          onApply={applyBulkColor}
          onClear={() => setSelectedKeys(new Set())}
        />
      </div>
      <div className="settings-row">
        <div className="sr-text">
          <div className="sr-title">{t('monitoring.color')}</div>
          <div className="sr-desc">{t('monitoring.colorHelp')}</div>
        </div>
        <div className="sr-control">
          <HighlightColorButton
            value={monitoring.color}
            label={t('monitoring.color')}
            onConfirm={(color) => onChange({ ...monitoring, color })}
          />
        </div>
      </div>
      <form className="monitoring-add-form" onSubmit={addManualUser}>
        <input
          type="text"
          className="monitoring-name-input"
          data-testid="monitoring-name-input"
          value={name}
          placeholder={t('monitoring.namePlaceholder')}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary"
          data-testid="monitoring-add"
          disabled={busy || !normalizedName}
        >
          {t('monitoring.add')}
        </button>
      </form>
      {monitoring.users.length > 0 && <label className="monitoring-select-all">
        <input
          ref={selectAllRef}
          data-testid="bulk-select-all-monitored"
          type="checkbox"
          checked={allSelected}
          onChange={toggleAllUsers}
        />
        <span>{t('bulkColors.selectAllMonitored')}</span>
      </label>}
      <div className="monitoring-user-list">
        {monitoring.users.length === 0 ? (
          <div className="monitoring-empty">{t('monitoring.empty')}</div>
        ) : monitoring.users.map((user) => {
          const key = monitoredUserKey(user)
          const displayName = user.name.startsWith('@') ? user.name : `@${user.name}`
          return (
          <div className="monitoring-user-row" key={key}>
            <input
              type="checkbox"
              data-select-monitor-key={key}
              aria-label={t('bulkColors.selectUser', { user: displayName })}
              checked={selectedKeys.has(key)}
              onChange={() => toggleUser(key)}
            />
            <span>{displayName}</span>
            <div className="monitoring-user-actions">
              <HighlightColorButton
                value={user.color || monitoring.color}
                label={t('monitoring.userColor', { user: displayName })}
                initialAlpha={user.color ? undefined : 128}
                onConfirm={(color) => onChange({
                  ...monitoring,
                  users: monitoring.users.map((item) =>
                    monitoredUserKey(item) === key ? { ...item, color } : item)
                })}
              />
              {user.color ? (
                <button
                  type="button"
                  className="monitoring-reset-color"
                  data-monitor-key={key}
                  aria-label={t('monitoring.useDefaultColor', { user: displayName })}
                  title={t('monitoring.useDefaultColor', { user: displayName })}
                  disabled={busy}
                  onClick={() => onChange({
                    ...monitoring,
                    users: monitoring.users.map((item) => {
                      if (monitoredUserKey(item) !== key) return item
                      const withoutColor = { ...item }
                      delete withoutColor.color
                      return withoutColor
                    })
                  })}
                >
                  ↺
                </button>
              ) : null}
            <button
              type="button"
              className="monitoring-remove"
              data-channel-id={user.channelId}
              data-monitor-key={key}
              aria-label={t('monitoring.remove', { user: displayName })}
              title={t('monitoring.remove', { user: displayName })}
              disabled={busy}
              onClick={() => removeUser(key)}
            >
              ×
            </button>
            </div>
          </div>
          )
        })}
      </div>
    </section>
  )
}
