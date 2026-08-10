import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ModerationLogChannelGroup,
  ModerationLogEntry,
  ModerationLogFilters,
  ModerationLogStreamKey
} from '../../../../shared/contracts/moderation-logs'
import { DeleteStreamDialog } from './DeleteStreamDialog'
import { LogFilters } from './LogFilters'
import { LogSidebar } from './LogSidebar'
import { LogSummary } from './LogSummary'
import { LogTable } from './LogTable'

const PAGE_SIZE = 100

export function ModerationLogsWindow(): ReactElement {
  const { t } = useTranslation(['moderationLogs', 'common'])
  const [groups, setGroups] = useState<ModerationLogChannelGroup[]>([])
  const [selectedKey, setSelectedKey] = useState<ModerationLogStreamKey | null>(
    null
  )
  const [filters, setFilters] = useState<ModerationLogFilters>({})
  const [entries, setEntries] = useState<ModerationLogEntry[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [totalMatched, setTotalMatched] = useState(0)
  const [counts, setCounts] = useState({
    timeout: 0,
    deleted: 0,
    hide: 0,
    total: 0
  })
  const [title, setTitle] = useState('')
  const [videoId, setVideoId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ key: ModerationLogStreamKey; title: string } | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const refreshChannels = useCallback(async () => {
    try {
      const next = await window.moderationLogs.listChannels()
      setGroups(next)
      setSelectedKey((prev) => {
        if (prev && next.some((g) => g.streams.some((s) => s.key === prev))) {
          return prev
        }
        return next[0]?.streams[0]?.key ?? null
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const loadPage = useCallback(
    async (key: ModerationLogStreamKey, nextOffset: number, append: boolean) => {
      setBusy(true)
      setError(null)
      try {
        const page = await window.moderationLogs.readPage({
          streamKey: key,
          filters,
          offset: nextOffset,
          limit: PAGE_SIZE
        })
        setEntries((prev) =>
          append ? [...prev, ...page.entries] : page.entries
        )
        setOffset(page.offset + page.entries.length)
        setHasMore(page.hasMore)
        setTotalMatched(page.totalMatched)
        setCounts(page.counts)
        setTitle(page.meta?.title || key)
        setVideoId(page.meta?.videoId || '')
        if (page.warnings.length > 0) {
          console.warn('[mod-logs]', page.warnings)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [filters]
  )

  useEffect(() => {
    void refreshChannels()
  }, [refreshChannels])

  useEffect(() => {
    if (!selectedKey) {
      setEntries([])
      return
    }
    void loadPage(selectedKey, 0, false)
  }, [selectedKey, filters, loadPage])

  useEffect(() => {
    const offAppend = window.moderationLogs.onAppended((event) => {
      void refreshChannels()
      if (event.streamKey === selectedKey) {
        setEntries((prev) => [event.entry, ...prev])
        setTotalMatched((n) => n + 1)
        setCounts((c) => ({
          ...c,
          total: c.total + 1,
          [event.entry.action]: c[event.entry.action] + 1
        }))
      }
    })
    const offError = window.moderationLogs.onError((event) => {
      setError(event.message)
    })
    return () => {
      offAppend()
      offError()
    }
  }, [refreshChannels, selectedKey])

  const selectedMeta = useMemo(() => {
    for (const g of groups) {
      const s = g.streams.find((x) => x.key === selectedKey)
      if (s) return s
    }
    return null
  }, [groups, selectedKey])

  async function handleExport(): Promise<void> {
    if (!selectedKey) return
    setBusy(true)
    try {
      await window.moderationLogs.exportCsv({
        streamKey: selectedKey,
        videoId: videoId || selectedMeta?.videoId,
        filters
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return
    setBusy(true)
    setDeleteError(null)
    try {
      const result = await window.moderationLogs.deleteStream(deleteTarget.key)
      if (result.ok) {
        setDeleteTarget(null)
        setSelectedKey(null)
        await refreshChannels()
      } else {
        setDeleteError(result.error || t('moderationLogs:deleteConfirm.failed'))
      }
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ml-window">
      <header className="ml-head">
        <h1>{t('moderationLogs:title')}</h1>
        <div className="ml-head-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!selectedKey || busy}
            onClick={() => void handleExport()}
          >
            {t('moderationLogs:export')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={!selectedKey || busy}
            onClick={() => {
              if (!selectedKey) return
              setDeleteError(null)
              setDeleteTarget({ key: selectedKey, title: title || selectedMeta?.title || selectedKey })
            }}
          >
            {t('moderationLogs:deleteStream')}
          </button>
        </div>
      </header>
      <div className="ml-body">
        <LogSidebar
          groups={groups}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
        />
        <div className="ml-main">
          {!selectedKey ? (
            <div className="ml-empty">{t('moderationLogs:pickStream')}</div>
          ) : (
            <>
              <div className="ml-toolbar">
                <div className="ml-stream-heading">
                  <h2>{title}</h2>
                  <span>{selectedMeta?.date || videoId}</span>
                </div>
                <LogSummary counts={counts} />
                <LogFilters filters={filters} onChange={setFilters} />
              </div>
              {error ? <div className="ml-error">{error}</div> : null}
              <LogTable
                entries={entries}
                emptyLabel={
                  busy
                    ? t('moderationLogs:loading')
                    : t('moderationLogs:emptyEntries')
                }
              />
              <div className="ml-footer">
                <span>
                  {t('moderationLogs:showing', {
                    shown: entries.length,
                    total: totalMatched
                  })}
                </span>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!hasMore || busy}
                  onClick={() => {
                    if (selectedKey) void loadPage(selectedKey, offset, true)
                  }}
                >
                  {t('moderationLogs:loadMore')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <DeleteStreamDialog
        open={!!deleteTarget}
        streamTitle={deleteTarget?.title || ''}
        busy={busy}
        error={deleteError}
        onCancel={() => {
          if (!busy) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
