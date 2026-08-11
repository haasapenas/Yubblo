import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { i18n } from './i18n/i18n-renderer'
import { UpdateWindow } from './features/update/UpdateWindow'
import './features/update/update-window.css'

const root = document.getElementById('root')
if (root) {
  void window.updatePopup.getLocale().then((locale) => i18n.changeLanguage(locale)).finally(() => {
    createRoot(root).render(<StrictMode><I18nextProvider i18n={i18n}><UpdateWindow /></I18nextProvider></StrictMode>)
  })
}
