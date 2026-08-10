import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import App from './app/App'
import { i18n } from './i18n/i18n-renderer'
import './styles.css'

const root = document.getElementById('root')
if (!root) {
  const error = document.createElement('div')
  error.style.cssText = 'color:#fff;padding:24px;font-family:sans-serif'
  error.textContent = i18n.t('renderer.rootMissing', { ns: 'errors' })
  document.body.replaceChildren(error)
} else {
  try {
    createRoot(root).render(
      <StrictMode>
        <I18nextProvider i18n={i18n}>
          <App />
        </I18nextProvider>
      </StrictMode>
    )
  } catch (cause) {
    const error = document.createElement('div')
    error.style.cssText = 'color:#ff6b6b;padding:24px;font-family:sans-serif'
    const title = document.createElement('h2')
    title.textContent = i18n.t('renderer.renderFailed', { ns: 'errors' })
    const detail = document.createElement('pre')
    detail.textContent = String((cause as Error)?.message || cause)
    error.append(title, detail)
    root.replaceChildren(error)
  }
}
