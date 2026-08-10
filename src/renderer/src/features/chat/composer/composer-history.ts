type ChannelHistory = {
  entries: string[]
  index: number
  draft: string
}

export class ComposerHistory {
  private readonly channels = new Map<string, ChannelHistory>()

  constructor(private readonly limit = 20) {}

  private state(key: string): ChannelHistory {
    let state = this.channels.get(key)
    if (!state) {
      state = { entries: [], index: 0, draft: '' }
      this.channels.set(key, state)
    }
    return state
  }

  record(key: string, value: string): void {
    const text = value.trim()
    if (!key || !text) return
    const state = this.state(key)
    if (state.entries.at(-1) !== text) state.entries.push(text)
    if (state.entries.length > this.limit) {
      state.entries.splice(0, state.entries.length - this.limit)
    }
    state.index = state.entries.length
  }

  edit(key: string, draft: string): void {
    if (!key) return
    const state = this.state(key)
    state.index = state.entries.length
    state.draft = draft
  }

  draft(key: string): string {
    return key ? this.state(key).draft : ''
  }

  previous(key: string, currentDraft: string): string | undefined {
    if (!key) return undefined
    const state = this.state(key)
    if (!state.entries.length || state.index === 0) return undefined
    if (state.index === state.entries.length) state.draft = currentDraft
    state.index -= 1
    return state.entries[state.index]
  }

  next(key: string, currentDraft: string): string | undefined {
    if (!key) return undefined
    const state = this.state(key)
    if (!state.entries.length || state.index >= state.entries.length) {
      return undefined
    }
    if (state.index < state.entries.length - 1) {
      state.index += 1
      return state.entries[state.index]
    }
    state.index = state.entries.length
    return state.draft
  }
}
