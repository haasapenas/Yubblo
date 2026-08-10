import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ChannelActivityGroup,
  ChannelActivityModerationRequest,
  ChannelActivityProfile,
  ChannelActivityReputation,
  ChannelActivityWindowState
} from '../../../../shared/types'
import { i18n } from '../../i18n/i18n-renderer'
import { ChannelActivityModerationBar } from './ChannelActivityModerationBar'

type ViewProps = {
  state: ChannelActivityWindowState | null
  selectedGroupKey: string | null
  onSelectGroup(key: string): void
  onBack(): void
  onLoadMore(): void
  onClose(): void
  onRunModeration(request: ChannelActivityModerationRequest): void
}

type Labels = {
  deleted: string
  timeouts: string
  hides: string
}

function MessageRows({ group }: { group: ChannelActivityGroup }) {
  return <div className={'channel-activity-messages'}>{group.messages.map((message) => <div className={'channel-activity-message'} key={message.id}>
    {message.avatarUrl ? <img src={message.avatarUrl} alt={''} /> : <span className={'channel-activity-avatar'} />}
    <div><span className={'channel-activity-author'}>{message.authorName}</span><span>{message.text}</span></div>
    <time className={'channel-activity-message-time'}>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
  </div>)}</div>
}

function ProfileSummary({ profile }: { profile: ChannelActivityProfile }) {
  return <section className={'channel-activity-profile'}>
    {profile.avatarUrl
      ? <img src={profile.avatarUrl} alt={''} />
      : <span className={'channel-activity-profile-fallback'}>{profile.name.slice(0, 1).toUpperCase()}</span>}
    <div className={'channel-activity-profile-info'}>
      <strong>{profile.name}</strong>
      {profile.createdText && <small>{profile.createdText}</small>}
      {profile.subscribersText && <small>{profile.subscribersText}</small>}
    </div>
  </section>
}

function ReputationStats({ reputation, labels }: { reputation: ChannelActivityReputation; labels: Labels }) {
  return <div className={'channel-activity-stats'}>
    <span className={'danger'}><b>{reputation.deletedMessages}</b>{labels.deleted}</span>
    <span className={'warning'}><b>{reputation.timeouts}</b>{labels.timeouts}</span>
    <span className={reputation.hides === 0 ? 'zero' : ''}><b>{reputation.hides}</b>{labels.hides}</span>
  </div>
}

function GroupPreview({ group, countLabel, onSelect }: {
  group: ChannelActivityGroup
  countLabel: string
  onSelect(): void
}) {
  return <button className={'channel-activity-group'} onClick={onSelect}>
    <span className={'channel-activity-group-top'}>
      <strong title={group.title}>{group.title}</strong>
      <span className={'channel-activity-group-chevron'}>›</span>
    </span>
    <span className={'channel-activity-group-meta'}>{countLabel}</span>
    <span className={'channel-activity-group-preview'}>
      {group.messages.slice(0, 3).map((message) =>
        <span className={'channel-activity-preview-message'} key={message.id}>{message.text}</span>
      )}
    </span>
  </button>
}

export function ChannelActivityView({ state, selectedGroupKey, onSelectGroup, onBack, onLoadMore, onClose, onRunModeration }: ViewProps) {
  const { t } = useTranslation('channelActivity', { i18n })
  if (!state || state.status === 'loading') return <main className={'channel-activity-window'}><header className={'channel-activity-head overview'}><strong>{t('title')}</strong><button className={'channel-activity-close'} title={t('close')} aria-label={t('close')} onClick={onClose}><span aria-hidden={'true'} /></button></header><p className={'channel-activity-status'}>{t('loading')}</p></main>
  if (state.status === 'error') return <main className={'channel-activity-window'}><header className={'channel-activity-head overview'}><strong>{t('title')}</strong><button className={'channel-activity-close'} title={t('close')} aria-label={t('close')} onClick={onClose}><span aria-hidden={'true'} /></button></header><p className={'channel-activity-status error'}>{state.message || t('unavailable')}</p></main>
  const selected = state.page.groups.find((group) => group.key === selectedGroupKey)
  if (selected) return <main className={'channel-activity-window'}>
    <header className={'channel-activity-head'}><button className={'channel-activity-back'} title={t('back')} onClick={onBack}>←</button><strong title={selected.title}>{selected.title}</strong><button className={'channel-activity-close'} title={t('close')} aria-label={t('close')} onClick={onClose}><span aria-hidden={'true'} /></button></header>
    <div className={'channel-activity-scroll'}><MessageRows group={selected} /></div>
    {state.page.hasMore && selected.messages.length < 100 && <footer className={'channel-activity-footer'}><button disabled={state.loadingMore} onClick={onLoadMore}>{state.loadingMore ? t('loading') : t('loadMore')}</button></footer>}
  </main>
  return <main className={'channel-activity-window'}>
    <header className={'channel-activity-head overview'}><strong>{t('title')}</strong><button className={'channel-activity-close'} title={t('close')} aria-label={t('close')} onClick={onClose}><span aria-hidden={'true'} /></button></header>
    <div className={'channel-activity-scroll'}>
      {state.page.profile && <ProfileSummary profile={state.page.profile} />}
      {state.moderation && <ChannelActivityModerationBar target={state.target} moderation={state.moderation} onRun={onRunModeration} />}
      {state.page.reputation && <section className={'channel-activity-section'}>
        <h3 className={'channel-activity-section-label'}>{t('moderatedLastYear')}</h3>
        <ReputationStats reputation={state.page.reputation} labels={{ deleted: t('deleted'), timeouts: t('timeouts'), hides: t('hides') }} />
      </section>}
      <section className={'channel-activity-section'}>
        <h3 className={'channel-activity-section-label'}>{t('messagesLastYear')} <span>· {state.page.messageCount}</span></h3>
        {state.page.groups.map((group) => <GroupPreview
          group={group}
          countLabel={t('count', { count: group.messages.length })}
          key={group.key}
          onSelect={() => onSelectGroup(group.key)}
        />)}
      </section>
    </div>
    {state.page.hasMore && <footer className={'channel-activity-footer'}><button disabled={state.loadingMore} onClick={onLoadMore}>{state.loadingMore ? t('loading') : t('loadMore')}</button></footer>}
  </main>
}

export function ChannelActivityWindow() {
  const [state, setState] = useState<ChannelActivityWindowState | null>(null)
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const targetId = state?.target.authorChannelId
  useEffect(() => window.channelActivity.onState(setState), [])
  useEffect(() => setSelectedGroupKey(null), [targetId])
  return <ChannelActivityView state={state} selectedGroupKey={selectedGroupKey} onSelectGroup={setSelectedGroupKey} onBack={() => setSelectedGroupKey(null)} onLoadMore={() => { void window.channelActivity.loadMore() }} onClose={() => { void window.channelActivity.close() }} onRunModeration={(request) => { void window.channelActivity.runModeration(request) }} />
}
