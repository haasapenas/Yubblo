import { useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppUpdateState } from '../../../../shared/contracts/update'

export function UpdateSettingsSection(): ReactElement {
  const { t } = useTranslation('settings')
  const [state, setState] = useState<AppUpdateState>({ status: 'idle', currentVersion: '0.1.0' })
  useEffect(() => {
    void window.settingsPopup.update.getState().then(setState)
    return window.settingsPopup.update.onChanged(setState)
  }, [])
  const statusText = state.status === 'idle' ? t('update.status.idle')
    : state.status === 'checking' ? t('update.status.checking')
      : state.status === 'available' ? t('update.status.available', { version: state.availableVersion ?? '' })
        : state.status === 'downloading' ? t('update.status.downloading')
          : state.status === 'downloaded' ? t('update.status.downloaded')
            : state.status === 'up-to-date' ? t('update.status.up-to-date')
              : state.status === 'error' ? t('update.status.error')
                : t('update.status.unsupported')
  return <div className="settings-row last">
    <div className="sr-text">
      <div className="sr-title">{t('update.title')}</div>
      <div className="sr-desc">{t('update.currentVersion', { version: state.currentVersion })} · {statusText}</div>
      {state.status === 'error' && <div className="sr-error">{t('update.error')}</div>}
    </div>
    <div className="sr-control">
      <button type="button" className="btn" disabled={state.status === 'checking'} onClick={() => void window.settingsPopup.update.check()}>
        {state.status === 'checking' ? t('update.checking') : t('update.check')}
      </button>
    </div>
  </div>
}
