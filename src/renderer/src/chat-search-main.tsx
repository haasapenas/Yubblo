import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ChatSearchWindow } from './features/chat-search/ChatSearchWindow'
import './features/chat-search/chat-search-window.css'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ChatSearchWindow />
    </StrictMode>
  )
}
