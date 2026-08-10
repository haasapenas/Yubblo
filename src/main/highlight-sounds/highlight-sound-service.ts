import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron'
import { readFile, stat } from 'fs/promises'
import { extname, resolve } from 'path'
import type { HighlightSoundData } from '../../shared/contracts/highlight-sounds'

const MAX_HIGHLIGHT_SOUND_BYTES = 20 * 1024 * 1024
const SOUND_FILTERS = [{ name: 'Audio', extensions: ['mp3', 'wav'] }]

export async function chooseHighlightSound(
  parent?: BrowserWindow | null
): Promise<string | null> {
  const options: OpenDialogOptions = { properties: ['openFile'], filters: SOUND_FILTERS }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? null : result.filePaths[0] || null
}

export async function readHighlightSound(inputPath: string): Promise<HighlightSoundData> {
  const path = resolve(String(inputPath || '').trim())
  const extension = extname(path).toLowerCase()
  const mimeType = extension === '.mp3'
    ? 'audio/mpeg'
    : extension === '.wav'
      ? 'audio/wav'
      : null
  if (!mimeType) throw new Error('UNSUPPORTED_HIGHLIGHT_SOUND')

  const info = await stat(path)
  if (!info.isFile()) throw new Error('INVALID_HIGHLIGHT_SOUND_FILE')
  if (info.size > MAX_HIGHLIGHT_SOUND_BYTES) {
    throw new Error('HIGHLIGHT_SOUND_TOO_LARGE')
  }
  const bytes = await readFile(path)
  return { path, mimeType, bytes: new Uint8Array(bytes) }
}

export { MAX_HIGHLIGHT_SOUND_BYTES }
