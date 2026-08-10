/**
 * Exclusão de uma transmissão inteira, confinada à raiz moderation-logs.
 */
import { rm } from 'fs/promises'
import { existsSync } from 'fs'
import { resolveStreamDir, splitStreamKey } from './moderation-log-paths'
import type { ModerationLogStore } from './moderation-log-store'

export async function deleteModerationLogStream(
  streamKey: string,
  store?: ModerationLogStore
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!splitStreamKey(streamKey)) {
    return { ok: false, error: 'invalid_stream_key' }
  }
  const dir = resolveStreamDir(streamKey)
  if (!dir) {
    return { ok: false, error: 'path_outside_root' }
  }
  if (!existsSync(dir)) {
    store?.forgetStreamKey(streamKey)
    return { ok: true }
  }
  try {
    await rm(dir, { recursive: true, force: true })
    store?.forgetStreamKey(streamKey)
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[mod-logs] delete failed', streamKey, message)
    return { ok: false, error: message }
  }
}
