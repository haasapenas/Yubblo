import { useEffect, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../i18n/i18n-renderer'
import type { AuthState } from '../../../../shared/types'
import packageJson from '../../../../../package.json'

export interface AppHeaderProps {
  auth: AuthState
  busy: boolean
  onOpenSettings(): void
  onLogin(): void
  onSwitchAccount(accountId: string): void
  onRemoveAccount(accountId: string): void
  onOpenIdentityPicker(): void
  onLogout(): void
}

/** Controles min/max/close no tema do app (Windows/Linux frameless). */
function WindowControls(): ReactElement | null {
  const [maximized, setMaximized] = useState(false)
  const api = typeof window !== 'undefined' ? window.yubblo?.window : undefined

  useEffect(() => {
    if (!api) return
    void api.isMaximized().then(setMaximized)
  }, [api])

  if (!api) return null

  return (
    <div className="window-controls" aria-label="Window controls">
      <button
        type="button"
        className="window-ctrl"
        title="Minimize"
        aria-label="Minimize"
        onClick={() => {
          void api.minimize()
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      </button>
      <button
        type="button"
        className="window-ctrl"
        title={maximized ? 'Restore' : 'Maximize'}
        aria-label={maximized ? 'Restore' : 'Maximize'}
        onClick={() => {
          void api.maximize().then(setMaximized)
        }}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path
              d="M3 1.5h5.5V7M1.5 3H7v5.5H1.5V3z"
              stroke="currentColor"
              strokeWidth="1.1"
              fill="none"
            />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <rect
              x="1.5"
              y="1.5"
              width="7"
              height="7"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
            />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="window-ctrl window-ctrl-close"
        title="Close"
        aria-label="Close"
        onClick={() => {
          void api.close()
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path
            d="M2 2l6 6M8 2L2 8"
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
          />
        </svg>
      </button>
    </div>
  )
}

export function AppHeader({
  auth,
  busy,
  onOpenSettings,
  onLogin,
  onSwitchAccount,
  onRemoveAccount,
  onOpenIdentityPicker,
  onLogout
}: AppHeaderProps): ReactElement {
  const { t } = useTranslation('auth', { i18n })
  const [menuOpen, setMenuOpen] = useState(false)
  const [showWindowControls, setShowWindowControls] = useState(false)

  useEffect(() => {
    const api = window.yubblo?.window
    if (!api) return
    void api.platform().then((p) => {
      // macOS usa traffic lights nativos (hiddenInset)
      setShowWindowControls(p === 'win32' || p === 'linux')
    })
  }, [])

  function closeThen(action: () => void): void {
    setMenuOpen(false)
    action()
  }

  return (
    <header className={`topbar${showWindowControls ? ' topbar-frameless' : ''}`}>
      <div className="brand">
        <span className="brand-title">Yubblo {packageJson.version}</span>
      </div>
      <div className="user-box">
        <button
          type="button"
          className="btn btn-ghost settings-btn"
          title={t('settings')}
          onClick={() => closeThen(onOpenSettings)}
        >⚙</button>
        {auth.loggedIn && auth.profile ? (
          <div className="account-switcher">
            <button
              type="button"
              className="account-switcher-btn"
              disabled={busy}
              onClick={() => setMenuOpen((open) => !open)}
              title={t('accountsChannels')}
            >
              {auth.profile.avatarUrl
                ? <img className="avatar" src={auth.profile.avatarUrl} alt="" />
                : <div className="avatar" />}
              <div className="user-meta">
                <strong title={auth.profile.name}>{auth.profile.name}</strong>
                <span>
                  {auth.profile.handle
                    ? `@${auth.profile.handle.replace(/^@/, '')}`
                    : `${t('switchAccount')} ▾`}
                </span>
              </div>
              <span className="account-caret">▾</span>
            </button>
            {menuOpen && (
              <>
                <div className="account-menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="account-menu" role="menu">
                  <div className="account-menu-title">{t('localAccounts')}</div>
                  {(auth.accounts || []).map((account) => (
                    <div key={account.id} className={`account-menu-row${account.active ? ' active' : ''}`}>
                      <button
                        type="button"
                        className="account-menu-item"
                        disabled={busy || account.active}
                        onClick={() => closeThen(() => onSwitchAccount(account.id))}
                      >
                        {account.profile.avatarUrl
                          ? <img src={account.profile.avatarUrl} alt="" />
                          : <div className="account-menu-avatar" />}
                        <span className="account-menu-text">
                          <strong>{account.profile.name}</strong>
                          <small>
                            {account.profile.handle
                              ? `@${account.profile.handle.replace(/^@/, '')}`
                              : account.profile.channelId || account.id}
                            {account.active ? ` · ${t('active')}` : ''}
                          </small>
                        </span>
                      </button>
                      {!account.active && (
                        <button
                          type="button"
                          className="account-menu-remove"
                          title={t('removeAccount')}
                          disabled={busy}
                          onClick={() => closeThen(() => onRemoveAccount(account.id))}
                        >×</button>
                      )}
                    </div>
                  ))}
                  <div className="account-menu-sep" />
                  <button type="button" className="account-menu-action" disabled={busy} onClick={() => closeThen(onOpenIdentityPicker)}>
                    {t('switchYoutubeChannel')}
                  </button>
                  <button type="button" className="account-menu-action danger" disabled={busy} onClick={() => closeThen(onLogout)}>
                    {t('logout')}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={onLogin}>
            {busy ? t('opening') : t('loginYoutube')}
          </button>
        )}
        {showWindowControls ? <WindowControls /> : null}
      </div>
    </header>
  )
}
