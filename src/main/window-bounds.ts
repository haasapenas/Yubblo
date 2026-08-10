/**
 * Persistência de tamanho/posição das janelas (main, settings).
 * Salva em userData/window-bounds.json — independente de settings.json.
 */
import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export type WindowBoundsId = 'main' | 'settings' | 'moderationLogs'

export interface SavedWindowBounds {
  x: number
  y: number
  width: number
  height: number
  isMaximized?: boolean
}

export interface WindowBoundsDefaults {
  width: number
  height: number
  minWidth: number
  minHeight: number
}

interface BoundsFile {
  version: 1
  windows: Partial<Record<WindowBoundsId, SavedWindowBounds>>
}

const FILE_NAME = 'window-bounds.json'

function filePath(): string {
  const d = app.getPath('userData')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return join(d, FILE_NAME)
}

function loadFile(): BoundsFile {
  const path = filePath()
  if (!existsSync(path)) return { version: 1, windows: {} }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<BoundsFile>
    const windows =
      parsed.windows && typeof parsed.windows === 'object' ? parsed.windows : {}
    return { version: 1, windows }
  } catch (e) {
    console.warn('[window-bounds] load failed', e)
    return { version: 1, windows: {} }
  }
}

function saveFile(data: BoundsFile): void {
  try {
    writeFileSync(filePath(), JSON.stringify(data, null, 2), 'utf8')
  } catch (e) {
    console.warn('[window-bounds] save failed', e)
  }
}

/** Valida e normaliza bounds salvos (sem checar display — puro). */
export function normalizeSavedBounds(
  raw: unknown,
  defaults: WindowBoundsDefaults
): SavedWindowBounds | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const width = Number(o.width)
  const height = Number(o.height)
  const x = Number(o.x)
  const y = Number(o.y)
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(defaults.minWidth, Math.round(width)),
    height: Math.max(defaults.minHeight, Math.round(height)),
    isMaximized: o.isMaximized === true
  }
}

/**
 * Garante que a janela fique (pelo menos parcialmente) num monitor visível.
 * Se o centro estiver fora de todos os displays, recentra no primário.
 */
export function clampBoundsToDisplays(
  bounds: SavedWindowBounds,
  displays: Array<{ workArea: Rectangle }>
): SavedWindowBounds {
  if (displays.length === 0) return bounds

  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  const onDisplay = displays.some((d) => {
    const a = d.workArea
    return cx >= a.x && cx < a.x + a.width && cy >= a.y && cy < a.y + a.height
  })
  if (onDisplay) return bounds

  const primary = displays[0]!.workArea
  return {
    ...bounds,
    x: Math.round(primary.x + (primary.width - bounds.width) / 2),
    y: Math.round(primary.y + (primary.height - bounds.height) / 2),
    isMaximized: false
  }
}

export function loadWindowBounds(
  id: WindowBoundsId,
  defaults: WindowBoundsDefaults
): SavedWindowBounds | null {
  const raw = loadFile().windows[id]
  const normalized = normalizeSavedBounds(raw, defaults)
  if (!normalized) return null
  try {
    const displays = screen.getAllDisplays()
    return clampBoundsToDisplays(normalized, displays)
  } catch {
    return normalized
  }
}

export function saveWindowBounds(
  id: WindowBoundsId,
  bounds: SavedWindowBounds
): void {
  const file = loadFile()
  file.windows[id] = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
    isMaximized: bounds.isMaximized === true
  }
  saveFile(file)
}

/** Aplica bounds salvos + grava resize/move/close. */
export function restoreAndTrackWindowBounds(
  win: BrowserWindow,
  id: WindowBoundsId,
  defaults: WindowBoundsDefaults
): void {
  const saved = loadWindowBounds(id, defaults)
  if (saved) {
    try {
      win.setBounds({
        x: saved.x,
        y: saved.y,
        width: saved.width,
        height: saved.height
      })
      if (saved.isMaximized && win.isMaximizable()) {
        win.maximize()
      }
    } catch (e) {
      console.warn('[window-bounds] restore failed', e)
    }
  }

  let timer: ReturnType<typeof setTimeout> | null = null

  const persist = (): void => {
    if (win.isDestroyed() || win.isMinimized()) return
    const b = win.getBounds()
    saveWindowBounds(id, {
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      isMaximized: win.isMaximized()
    })
  }

  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(persist, 250)
  }

  win.on('resize', schedule)
  win.on('move', schedule)
  win.on('maximize', schedule)
  win.on('unmaximize', schedule)
  win.on('close', () => {
    if (timer) clearTimeout(timer)
    persist()
  })
}
