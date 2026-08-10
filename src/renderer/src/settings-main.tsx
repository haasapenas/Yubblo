import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { SettingsWindow } from './features/settings/SettingsWindow'
import { i18n } from './i18n/i18n-renderer'
import './features/settings/settings-window.css'

const root = document.getElementById('root')
if (root) {
  void window.settingsPopup
    .get()
    .then((s) => i18n.changeLanguage(s.locale))
    .catch(() => undefined)
    .finally(() => {
      createRoot(root).render(
        <StrictMode>
          <I18nextProvider i18n={i18n}>
            <SettingsWindow />
          </I18nextProvider>
        </StrictMode>
      )
    })
}
