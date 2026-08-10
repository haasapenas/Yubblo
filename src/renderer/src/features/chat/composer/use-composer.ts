import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { AppError, EmoteCatalog } from '../../../../../shared/types'
import { i18n } from '../../../i18n/i18n-renderer'
import { ComposerHistory } from './composer-history'
import { getUnicodeEmojiCatalog } from './emoji-catalog'
import {
  chooseDefaultSource,
  filterPickerItems,
  normalizeCatalogItems,
  normalizeUnicodeItem,
  type PickerItem,
  type PickerScope,
  type PickerSource
} from './emote-sources'
import type { ChatAuthor } from './MentionPicker'

function getMentionState(
  text: string,
  cursor: number
): { start: number; query: string } | null {
  if (cursor < 0 || cursor > text.length) return null
  const before = text.slice(0, cursor)
  const m = before.match(/(?:^|[\s])@([^\s@]*)$/)
  if (!m) return null
  const start = before.lastIndexOf('@')
  return { start, query: m[1] || '' }
}

function filterAuthors(authors: ChatAuthor[], query: string, limit = 8): ChatAuthor[] {
  const list = [...authors].sort((a, b) => b.lastSeen - a.lastSeen)
  const q = query.trim().toLowerCase()
  if (!q) return list.slice(0, limit)
  const starts = list.filter((a) => a.name.toLowerCase().replace(/^@/, '').startsWith(q))
  if (starts.length >= limit) return starts.slice(0, limit)
  const contains = list.filter(
    (a) =>
      !a.name.toLowerCase().replace(/^@/, '').startsWith(q) &&
      a.name.toLowerCase().includes(q)
  )
  return [...starts, ...contains].slice(0, limit)
}

function parseIpcError(e: unknown): AppError {
  const msg = e instanceof Error ? e.message : String(e)
  try {
    const j = JSON.parse(msg) as AppError
    if (j?.code && j?.message) return j
  } catch {
    /* ignore */
  }
  return { code: 'UNKNOWN', message: msg || i18n.t('unknown', { ns: 'errors' }) }
}

export type ComposerProps = {
  canChat: boolean
  authLoggedIn: boolean
  activeVideoId: string | null
  historyKey: string | null
  /** Epoch ms — 0/undefined = livre */
  sendCooldownUntil?: number
  slowModeSeconds?: number
  /** Autores do chat (lê ref no parent — não re-renderiza o Composer) */
  getAuthors: () => ChatAuthor[]
  /** Envia ou /clear. Rejeita Promise para restaurar o draft. */
  onSend: (text: string) => Promise<void>
  onError: (err: AppError) => void
}

export function useComposer({
  canChat,
  authLoggedIn,
  activeVideoId,
  historyKey,
  sendCooldownUntil = 0,
  slowModeSeconds = 0,
  getAuthors,
  onSend,
  onError
}: ComposerProps) {
  const [draft, setDraft] = useState('')
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStart, setMentionStart] = useState(0)
  const [mentionIndex, setMentionIndex] = useState(0)
  /** força recompute de sugestões sem depender do App */
  const [mentionTick, setMentionTick] = useState(0)

  const [emotePickerOpen, setEmotePickerOpen] = useState(false)
  const [emoteSource, setEmoteSource] = useState<PickerSource>('emoji')
  const [emoteScope, setEmoteScope] = useState<PickerScope>('channel')
  const [emoteQuery, setEmoteQuery] = useState('')
  const [emoteCatalog, setEmoteCatalog] = useState<EmoteCatalog | null>(null)
  const [emoteLoading, setEmoteLoading] = useState(false)

  const [cooldownTick, setCooldownTick] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeVideoIdRef = useRef(activeVideoId)
  activeVideoIdRef.current = activeVideoId
  const historyRef = useRef(new ComposerHistory(20))
  const historyKeyRef = useRef(historyKey)
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    const previousKey = historyKeyRef.current
    if (previousKey) historyRef.current.edit(previousKey, draftRef.current)
    historyKeyRef.current = historyKey
    const nextDraft = historyKey ? historyRef.current.draft(historyKey) : ''
    setDraft(nextDraft)
    draftRef.current = nextDraft
    setMentionOpen(false)
  }, [historyKey])

  useEffect(() => {
    if (!sendCooldownUntil || sendCooldownUntil <= Date.now()) return
    const id = window.setInterval(() => setCooldownTick((n) => n + 1), 250)
    return () => window.clearInterval(id)
  }, [sendCooldownUntil])

  const sendCooldownRemaining = useMemo(() => {
    void cooldownTick
    if (!sendCooldownUntil) return 0
    return Math.max(0, Math.ceil((sendCooldownUntil - Date.now()) / 1000))
  }, [sendCooldownUntil, cooldownTick])

  const sendBlocked = sendCooldownRemaining > 0

  const mentionSuggestions = useMemo(() => {
    void mentionTick
    return filterAuthors(getAuthors(), mentionQuery, 8)
  }, [getAuthors, mentionQuery, mentionTick])

  const refreshEmoteCatalog = useCallback(
    async (videoId?: string | null, pickDefaultSource = false) => {
      if (!window.yubblo) return null
      const vid = videoId ?? activeVideoIdRef.current
      setEmoteLoading(true)
      try {
        const cat = await window.yubblo.chat.getEmoteCatalog(vid)
        setEmoteCatalog(cat)
        if (pickDefaultSource) {
          const defaultSource = chooseDefaultSource(cat)
          setEmoteSource(defaultSource.source)
          setEmoteScope(defaultSource.scope)
        }
        return cat
      } catch {
        return null
      } finally {
        setEmoteLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (!window.yubblo) return
    const off = window.yubblo.chat.onEmotesReady(({ videoId }) => {
      if (videoId === activeVideoIdRef.current && emotePickerOpen) {
        void refreshEmoteCatalog(videoId)
      }
    })
    return off
  }, [emotePickerOpen, refreshEmoteCatalog])

  useEffect(() => {
    if (emotePickerOpen) void refreshEmoteCatalog(activeVideoId, true)
  }, [activeVideoId])

  const emoteItems = useMemo(() => {
    let items: PickerItem[]
    if (emoteSource === 'emoji') {
      items = getUnicodeEmojiCatalog().map(normalizeUnicodeItem)
    } else if (!emoteCatalog) {
      items = []
    } else if (emoteSource === 'youtube') {
      items = normalizeCatalogItems('youtube', emoteCatalog.youtube)
    } else {
      const sourceItems = emoteScope === 'channel'
        ? emoteCatalog.stvChannel
        : emoteCatalog.stvGlobal
      items = normalizeCatalogItems('7tv', sourceItems)
    }
    return filterPickerItems(items, emoteQuery)
  }, [emoteCatalog, emoteQuery, emoteScope, emoteSource])

  function updateMentionFromDraft(text: string, cursor: number): void {
    const st = getMentionState(text, cursor)
    if (!st) {
      setMentionOpen(false)
      setMentionQuery('')
      return
    }
    setMentionStart(st.start)
    setMentionQuery(st.query)
    setMentionOpen(true)
    setMentionIndex(0)
    setMentionTick((t) => t + 1)
  }

  function applyMention(author: ChatAuthor): void {
    const input = inputRef.current
    const cursor = input?.selectionStart ?? draft.length
    const st = getMentionState(draft, cursor) || {
      start: mentionStart,
      query: mentionQuery
    }
    const before = draft.slice(0, st.start)
    const after = draft.slice(cursor)
    const mentionName = author.name.replace(/^@/, '')
    const next = `${before}@${mentionName} ${after}`
    setDraft(next)
    setMentionOpen(false)
    setMentionQuery('')
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      const pos = before.length + mentionName.length + 2
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  function handleDraftChange(value: string, cursor: number): void {
    historyRef.current.edit(historyKeyRef.current || '', value)
    setDraft(value)
    updateMentionFromDraft(value, cursor)
  }

  function handleComposerKeyDown(e: ReactKeyboardEvent<HTMLInputElement>): void {
    if (mentionOpen && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => (i + 1) % mentionSuggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex(
          (i) => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length
        )
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const pick = mentionSuggestions[mentionIndex] || mentionSuggestions[0]
        if (pick) applyMention(pick)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionOpen(false)
      }
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSend()
      return
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const key = historyKeyRef.current || ''
      const next = e.key === 'ArrowUp'
        ? historyRef.current.previous(key, draft)
        : historyRef.current.next(key, draft)
      if (next !== undefined) {
        e.preventDefault()
        setDraft(next)
        setMentionOpen(false)
        requestAnimationFrame(() => {
          const input = inputRef.current
          input?.setSelectionRange(next.length, next.length)
        })
      }
      return
    }
    if (e.key === 'Escape') {
      setMentionOpen(false)
    }
  }

  function insertEmote(item: PickerItem): void {
    const input = inputRef.current
    const insert = item.insertText
    const cur = draft
    let start = cur.length
    let end = cur.length
    if (input) {
      start = input.selectionStart ?? cur.length
      end = input.selectionEnd ?? cur.length
    }
    const before = cur.slice(0, start)
    const after = cur.slice(end)
    const needSpaceBefore =
      before.length > 0 && !/\s$/.test(before) && !item.zeroWidth
    const needSpaceAfter =
      !item.zeroWidth && after.length > 0 && !/^\s/.test(after)
    const piece =
      (needSpaceBefore ? ' ' : '') + insert + (needSpaceAfter ? ' ' : '')
    const next = before + piece + after
    const caret = before.length + piece.length
    setDraft(next)
    setMentionOpen(false)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  async function toggleEmotePicker(): Promise<void> {
    if (emotePickerOpen) {
      setEmotePickerOpen(false)
      return
    }
    setEmotePickerOpen(true)
    setEmoteQuery('')
    await refreshEmoteCatalog(activeVideoId, emoteCatalog === null)
  }

  function handleSend(e?: FormEvent): void {
    e?.preventDefault()
    if (!window.yubblo) return
    if (mentionOpen && mentionSuggestions.length > 0) {
      const pick = mentionSuggestions[mentionIndex] || mentionSuggestions[0]
      if (pick) applyMention(pick)
      return
    }
    const text = draft.trim()
    if (!text) return

    if (sendBlocked) {
      onError({
        code: 'SEND_FAILED',
        message:
          slowModeSeconds > 0
            ? i18n.t('slowWait', { ns: 'chat', seconds: sendCooldownRemaining })
            : i18n.t('wait', { ns: 'chat', seconds: sendCooldownRemaining })
      })
      return
    }

    setDraft('')
    setMentionOpen(false)

    const key = historyKeyRef.current || ''
    historyRef.current.edit(key, '')
    void onSend(text)
      .then(() => historyRef.current.record(key, text))
      .catch((err) => {
        historyRef.current.edit(key, text)
        if (historyKeyRef.current === key) setDraft(text)
        onError(parseIpcError(err))
      })
  }

  return {
    canChat, authLoggedIn, activeVideoId, slowModeSeconds,
    draft, inputRef, sendBlocked, sendCooldownRemaining,
    mentionOpen, mentionQuery, mentionSuggestions, mentionIndex, setMentionIndex,
    emotePickerOpen, setEmotePickerOpen, emoteSource, setEmoteSource,
    emoteScope, setEmoteScope, emoteQuery, setEmoteQuery, emoteCatalog,
    emoteLoading, emoteItems,
    applyMention, insertEmote, toggleEmotePicker, handleSend,
    handleDraftChange, handleComposerKeyDown, updateMentionFromDraft
  }
}
