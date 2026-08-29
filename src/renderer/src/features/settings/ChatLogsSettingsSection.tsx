import { useState, type FormEvent, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChatLogsSettings } from '../../../../shared/types'

interface Props {
  chatLogs: ChatLogsSettings
  path: string
  busy: boolean
  onChange(next: ChatLogsSettings): void
  onOpenFolder(): void
}

function normalizeChannel(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase()
}

export function ChatLogsSettingsSection({
  chatLogs,
  path,
  busy,
  onChange,
  onOpenFolder
}: Props): ReactElement {
  const { t } = useTranslation('settings')
  const [channel, setChannel] = useState('')
  const normalizedChannel = normalizeChannel(channel)

  function addChannel(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!normalizedChannel || chatLogs.channels.includes(normalizedChannel)) return
    onChange({
      ...chatLogs,
      channels: [...chatLogs.channels, normalizedChannel]
    })
    setChannel('')
  }

  function removeChannel(value: string): void {
    onChange({
      ...chatLogs,
      channels: chatLogs.channels.filter((item) => item !== value)
    })
  }

  return (
    <section className="settings-section chat-logs-settings-section">
      <div>
        <h3>{t('chatLogs.title')}</h3>
        <p className="settings-hint">{t('chatLogs.help')}</p>
      </div>

      <div className="settings-row chat-logs-setting-row">
        <div className="sr-text">
          <div className="sr-title">{t('chatLogs.enabled')}</div>
        </div>
        <div className="sr-control">
          <input
            type="checkbox"
            data-testid="chat-logs-enabled"
            aria-label={t('chatLogs.enabled')}
            checked={chatLogs.enabled}
            disabled={busy}
            onChange={(event) =>
              onChange({ ...chatLogs, enabled: event.target.checked })
            }
          />
        </div>
      </div>

      <div className="settings-row chat-logs-setting-row chat-logs-path-row">
        <div className="sr-text">
          <div className="sr-title">{t('chatLogs.path')}</div>
          <code className="chat-logs-path">
            {path || t('chatLogs.pathUnavailable')}
          </code>
        </div>
        <div className="sr-control">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={onOpenFolder}
          >
            {t('chatLogs.openFolder')}
          </button>
        </div>
      </div>

      <div className="settings-row chat-logs-setting-row chat-logs-only-listed-row">
        <div className="sr-text">
          <div className="sr-title">{t('chatLogs.onlyListedChannels')}</div>
        </div>
        <div className="sr-control">
          <input
            type="checkbox"
            data-testid="chat-logs-only-listed"
            aria-label={t('chatLogs.onlyListedChannels')}
            checked={chatLogs.onlyListedChannels}
            disabled={busy}
            onChange={(event) =>
              onChange({
                ...chatLogs,
                onlyListedChannels: event.target.checked
              })
            }
          />
        </div>
      </div>

      <div className="chat-logs-channel-editor">
        <form className="chat-logs-channel-form" onSubmit={addChannel}>
          <input
            type="text"
            className="chat-logs-channel-input"
            data-testid="chat-logs-channel-input"
            value={channel}
            placeholder={t('chatLogs.channelPlaceholder')}
            disabled={busy}
            onChange={(event) => setChannel(event.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary"
            data-testid="chat-logs-channel-add"
            disabled={busy || !normalizedChannel}
          >
            {t('chatLogs.add')}
          </button>
        </form>

        <div className="chat-logs-channel-list">
          {chatLogs.channels.length === 0 ? (
            <div className="chat-logs-empty">{t('chatLogs.empty')}</div>
          ) : (
            chatLogs.channels.map((item) => (
              <div className="chat-logs-channel-row" key={item}>
                <span>@{item}</span>
                <button
                  type="button"
                  className="chat-logs-remove"
                  aria-label={t('chatLogs.remove', { channel: `@${item}` })}
                  title={t('chatLogs.remove', { channel: `@${item}` })}
                  disabled={busy}
                  onClick={() => removeChannel(item)}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}
