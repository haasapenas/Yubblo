import { useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppUpdateState } from '../../../../shared/contracts/update'

export function UpdateWindow(): ReactElement {
  const { t } = useTranslation('update')
  const [state, setState] = useState<AppUpdateState>({ status: 'idle', currentVersion: '0.1.0' })
  useEffect(() => {
    void window.updatePopup.getState().then(setState)
    return window.updatePopup.onChanged(setState)
  }, [])
  const downloading = state.status === 'downloading'
  const downloaded = state.status === 'downloaded'
  return <main className="update-card">
    <h1>{t('title')}</h1>
    <p className="update-description">{downloaded ? t('ready') : downloading ? t('downloading') : t('available')}</p>
    <div className="update-versions">
      <span>{t('currentVersion', { version: state.currentVersion })}</span>
      <span>{t('newVersion', { version: state.availableVersion ?? '—' })}</span>
    </div>
    {downloading && <div className="update-progress"><div style={{ width: `${state.progressPercent ?? 0}%` }} /></div>}
    {state.status === 'error' && <p className="update-error">{t('error')}</p>}
    <div className="update-actions">
      <button type="button" className="btn-secondary" onClick={() => void window.updatePopup.close()}>{t('later')}</button>
      {!downloaded && <button type="button" className="btn-primary" disabled={downloading} onClick={() => void window.updatePopup.download()}>{downloading ? t('downloadingPercent', { percent: Math.round(state.progressPercent ?? 0) }) : t('updateNow')}</button>}
      {downloaded && <button type="button" className="btn-primary" onClick={() => void window.updatePopup.install()}>{t('restartInstall')}</button>}
    </div>
  </main>
}
