import type { ChannelSession } from './chat-session'

export class SessionRegistry {
  private readonly sessions = new Map<string, ChannelSession>()
  private activeVideoId: string | null = null

  constructor(private readonly maxSessions: number) {}

  add(session: ChannelSession): void {
    const videoId = session.info.videoId
    if (!this.sessions.has(videoId) && this.sessions.size >= this.maxSessions) {
      const oldest =
        [...this.sessions.keys()].find((id) => id !== this.activeVideoId) ||
        this.sessions.keys().next().value
      if (oldest) this.remove(oldest)
    }
    this.sessions.set(videoId, session)
  }

  get(videoId: string): ChannelSession | undefined {
    return this.sessions.get(videoId)
  }

  require(videoId: string): ChannelSession {
    const session = this.get(videoId)
    if (!session) throw new Error('Sessao nao encontrada')
    return session
  }

  activate(videoId: string): ChannelSession {
    const session = this.require(videoId)
    this.activeVideoId = videoId
    return session
  }

  active(): ChannelSession | null {
    if (!this.activeVideoId) return null
    return this.sessions.get(this.activeVideoId) || null
  }

  activeId(): string | null {
    return this.activeVideoId
  }

  setActive(videoId: string | null): void {
    this.activeVideoId = videoId
  }

  remove(videoId: string): ChannelSession | null {
    const removed = this.sessions.get(videoId) || null
    if (!removed) return null
    this.sessions.delete(videoId)
    if (this.activeVideoId === videoId) {
      this.activeVideoId = this.sessions.keys().next().value || null
    }
    return removed
  }

  values(): ChannelSession[] {
    return [...this.sessions.values()]
  }

  storage(): Map<string, ChannelSession> {
    return this.sessions
  }

  has(videoId: string): boolean {
    return this.sessions.has(videoId)
  }

  get size(): number {
    return this.sessions.size
  }

  clear(destroy: (session: ChannelSession) => void): void {
    for (const session of this.sessions.values()) destroy(session)
    this.sessions.clear()
    this.activeVideoId = null
  }
}
