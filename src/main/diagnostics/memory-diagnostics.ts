export interface MemoryMetric {
  pid: number
  type: string
  memory: {
    workingSetSize: number
    peakWorkingSetSize?: number
  }
}

import { writeHeapSnapshot } from 'node:v8'

export interface MemoryDiagnosticsOptions {
  enabled: boolean
  intervalMs?: number
  memoryUsage(): NodeJS.MemoryUsage
  appMetrics(): MemoryMetric[]
  log(message: string): void
}

const bytesToMb = (value: number): string =>
  (value / 1024 / 1024).toFixed(1)

const kbToMb = (value: number): string =>
  (value / 1024).toFixed(1)

export function startMemoryDiagnostics(
  options: MemoryDiagnosticsOptions
): () => void {
  if (!options.enabled) return () => undefined

  const report = (): void => {
    const memory = options.memoryUsage()
    const processes = options.appMetrics()
      .map((metric) => `${metric.type}:${kbToMb(metric.memory.workingSetSize)}MB`)
      .join(',')
    options.log(
      `[memory] rss=${bytesToMb(memory.rss)}MB ` +
      `heap=${bytesToMb(memory.heapUsed)}/${bytesToMb(memory.heapTotal)}MB ` +
      `external=${bytesToMb(memory.external)}MB processes=${processes || 'none'}`
    )
  }

  const timer = setInterval(report, options.intervalMs ?? 30_000)
  timer.unref?.()
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
  }
}

export function scheduleMainHeapDump(
  dest: string,
  delayMs = 25_000,
  log: (message: string) => void = console.log
): () => void {
  log(`[memory] main heap dump in ${Math.round(delayMs / 1000)}s -> ${dest}`)
  const timer = setTimeout(() => {
    const file = writeHeapSnapshot(dest)
    log(`[memory] wrote ${file}`)
  }, delayMs)
  timer.unref?.()
  return () => clearTimeout(timer)
}