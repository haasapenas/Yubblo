import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          channelActivity: resolve('src/preload/channel-activity.ts'),
          chatSearch: resolve('src/preload/chat-search.ts'),
          settingsWindow: resolve('src/preload/settings-window.ts'),
          moderationLogs: resolve('src/preload/moderation-logs.ts'),
          updateWindow: resolve('src/preload/update-window.ts')
        },
        output: {
          // .cjs obrigatório: package.json tem "type": "module"
          // e o preload usa require() (CommonJS do Electron)
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          channelActivity: resolve('src/renderer/channel-activity.html'),
          chatSearch: resolve('src/renderer/chat-search.html'),
          settings: resolve('src/renderer/settings.html'),
          moderationLogs: resolve('src/renderer/moderation-logs.html'),
          update: resolve('src/renderer/update.html')
        }
      }
    },
    plugins: [react()]
  }
})
