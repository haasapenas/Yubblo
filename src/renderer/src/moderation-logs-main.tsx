import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { ModerationLogsWindow } from './features/moderation-logs/ModerationLogsWindow'
import { i18n } from './i18n/i18n-renderer'
import './features/moderation-logs/moderation-logs.css'

const root = document.getElementById('root')
if (root) {
  void window.moderationLogs
    .getLocale()
    .then((locale) => i18n.changeLanguage(locale))
    .catch(() => undefined)
    .finally(() => {
      createRoot(root).render(
        <StrictMode>
          <I18nextProvider i18n={i18n}>
            <ModerationLogsWindow />
          </I18nextProvider>
        </StrictMode>
      )
    })
}
