import { useState, type FormEvent, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { MonitoringSettings } from '../../../../shared/types'
import { monitoredUserKey, normalizeMonitoringName } from '../../../../shared/monitoring'
import { HighlightColorButton } from './highlights/HighlightColorPicker'

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
  const normalizedName = normalizeMonitoringName(name)

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

  return (
    <section className="settings-section monitoring-settings-section">
      <div>
        <h3>{t('monitoring.title')}</h3>
        <p className="settings-hint">{t('monitoring.help')}</p>
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
      <div className="monitoring-user-list">
        {monitoring.users.length === 0 ? (
          <div className="monitoring-empty">{t('monitoring.empty')}</div>
        ) : monitoring.users.map((user) => {
          const key = monitoredUserKey(user)
          const displayName = user.name.startsWith('@') ? user.name : `@${user.name}`
          return (
          <div className="monitoring-user-row" key={key}>
            <span>{displayName}</span>
            <button
              type="button"
              className="monitoring-remove"
              data-channel-id={user.channelId}
              data-monitor-key={key}
              aria-label={t('monitoring.remove', { user: displayName })}
              title={t('monitoring.remove', { user: displayName })}
              disabled={busy}
              onClick={() => onChange({
                ...monitoring,
                users: monitoring.users.filter((item) => monitoredUserKey(item) !== key)
              })}
            >
              ×
            </button>
          </div>
          )
        })}
      </div>
    </section>
  )
}
