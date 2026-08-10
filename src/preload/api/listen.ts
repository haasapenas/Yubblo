import type { IpcRenderer, IpcRendererEvent } from 'electron'

export function listen<T>(
  ipc: Pick<IpcRenderer, 'on' | 'removeListener'>,
  channel: string,
  callback: (payload: T) => void
): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipc.on(channel, listener)
  return () => ipc.removeListener(channel, listener)
}
