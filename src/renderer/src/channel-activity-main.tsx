import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { ChannelActivityWindow } from './features/channel-activity/ChannelActivityWindow'
import { i18n } from './i18n/i18n-renderer'
import './features/channel-activity/channel-activity-window.css'

const root = document.getElementById('root')
if (root) void window.channelActivity.getLocale().then((locale) => i18n.changeLanguage(locale)).finally(() => {
  createRoot(root).render(<StrictMode><I18nextProvider i18n={i18n}><ChannelActivityWindow /></I18nextProvider></StrictMode>)
})
