/**
 * Deduplicação em memória de eco local vs YouTube.
 * Assinatura nunca é persistida.
 */
import type { ModerationLogAction } from '../../shared/contracts/moderation-logs'

export interface DedupCandidate {
  streamKey: string
  action: ModerationLogAction
  moderator: string
  user: string
  message: string
  at: number
}

function norm(s: string): string {
  return String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function baseSignature(c: DedupCandidate): string {
  return [
    c.streamKey,
    c.action,
    norm(c.user),
    norm(c.message).slice(0, 200)
  ].join('|')
}

function exactSignature(c: DedupCandidate): string {
  return `${baseSignature(c)}|${norm(c.moderator)}`
}

export class ModerationLogDeduplicator {
  private readonly entries = new Map<string, number>()
  private readonly knownByBase = new Map<string, number>()
  private readonly unknownByBase = new Map<string, number>()
  private readonly windowMs: number
  private readonly maxEntries: number

  constructor(windowMs = 45_000, maxEntries = 2_000) {
    this.windowMs = windowMs
    this.maxEntries = maxEntries
  }

  /** true = já visto (ignorar). false = novo (gravar). */
  isDuplicate(candidate: DedupCandidate, now = Date.now()): boolean {
    this.expire(now)
    const base = baseSignature(candidate)
    const moderator = norm(candidate.moderator)
    const sig = exactSignature(candidate)
    const prev = this.entries.get(sig)
    if (prev != null && now - prev <= this.windowMs) {
      return true
    }
    const wildcardPrev = moderator
      ? this.unknownByBase.get(base)
      : Math.max(
          this.knownByBase.get(base) ?? -Infinity,
          this.unknownByBase.get(base) ?? -Infinity
        )
    if (wildcardPrev != null && now - wildcardPrev <= this.windowMs) return true
    this.entries.set(sig, now)
    const baseIndex = moderator ? this.knownByBase : this.unknownByBase
    baseIndex.set(base, now)
    this.trim()
    return false
  }

  private expire(now: number): void {
    for (const [key, at] of this.entries) {
      if (now - at > this.windowMs) this.entries.delete(key)
    }
    for (const map of [this.knownByBase, this.unknownByBase]) {
      for (const [key, at] of map) {
        if (now - at > this.windowMs) map.delete(key)
      }
    }
  }

  private trim(): void {
    if (this.entries.size <= this.maxEntries) return
    const drop = this.entries.size - this.maxEntries
    let i = 0
    for (const key of this.entries.keys()) {
      if (i++ >= drop) break
      this.entries.delete(key)
    }
    for (const map of [this.knownByBase, this.unknownByBase]) {
      while (map.size > this.maxEntries) map.delete(map.keys().next().value!)
    }
  }
}
