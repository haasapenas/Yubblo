export interface ActiveIdentity {
  onBehalfOfUser?: string
  identityId?: string
  selfChannelId?: string
  selfName?: string
  selfHandle?: string
}

export function preferPageId(
  candidates: Array<string | undefined | null>
): string | undefined {
  const normalized: string[] = []
  for (const candidate of candidates) {
    if (!candidate) continue
    const value = candidate.trim().replace(/\|+$/g, '')
    if (!value || value.length < 6) continue
    if (value.includes('||')) {
      const head = value.split('||')[0]!.trim()
      if (head.length >= 6 && !normalized.includes(head)) {
        normalized.push(head)
      }
    }
    if (!normalized.includes(value)) normalized.push(value)
  }

  normalized.sort((a, b) => {
    const pipeDifference =
      Number(a.includes('||')) - Number(b.includes('||'))
    if (pipeDifference !== 0) return pipeDifference
    return (
      Number(!/^[0-9]{10,}$/.test(a)) -
      Number(!/^[0-9]{10,}$/.test(b))
    )
  })
  return normalized[0]
}

export interface IdentityServiceDeps {
  stopLiveWatch(): void
  stopChat(): void
  stopAllPollers(): void
  rejoinSessionsAfterAuth(): Promise<void>
  clearChatState(): void
}

export class IdentityService {
  private readonly innertube = new InnertubeSession()
  private selfChannelId: string | undefined
  private selfName: string | undefined
  private selfHandle: string | undefined
  private lastProfileFromRemote = false
  private onBehalfOfUser: string | undefined
  private activeIdentityId: string | undefined
  private identitySwitchInfo = new Map<
    string,
    {
      pageId?: string
      pageIdCandidates?: string[]
      isDefaultIdentity?: boolean
      channelId?: string
      isSelected: boolean
      name?: string
      handle?: string
      avatarUrl?: string
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serviceEndpoint?: any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navEndpoint?: any
    }
  >()

  constructor(private readonly deps: IdentityServiceDeps) {}

  private get yt(): Innertube | null {
    return this.innertube.yt
  }

  private set yt(value: Innertube | null) {
    this.innertube.yt = value
  }

  private get cookie(): string | null {
    return this.innertube.cookie
  }

  private set cookie(value: string | null) {
    this.innertube.cookie = value
  }

  getYt(): Innertube | null {
    return this.yt
  }

  getCookie(): string | null {
    return this.cookie
  }

  getSelfChannelId(): string | undefined {
    return this.selfChannelId
  }

  getSelfName(): string | undefined {
    return this.selfName
  }

  getSelfHandle(): string | undefined {
    return this.selfHandle
  }

  getOnBehalfOfUser(): string | undefined {
    return this.onBehalfOfUser
  }

  getActiveIdentityId(): string | undefined {
    return this.activeIdentityId
  }

  async initGuest(): Promise<void> {
    this.yt = null
    this.cookie = null
    this.selfChannelId = undefined
    this.selfName = undefined
    this.selfHandle = undefined
    this.onBehalfOfUser = undefined
    this.activeIdentityId = undefined
    this.lastProfileFromRemote = false
    this.identitySwitchInfo.clear()
    void loadGlobalEmotes()

    this.yt = await Innertube.create({
      ...getYoutubeSessionLocale(app),
      cache: new UniversalCache(false),
      generate_session_locally: true,
      retrieve_player: false
    })
    console.log(
      '[chat-service] guest innertube logged_in=',
      this.yt.session.logged_in
    )
  }

  async initWithCookie(
    cookie: string | null,
    opts?: { onBehalfOfUser?: string; identityId?: string }
  ): Promise<UserProfile | null> {
    this.yt = null
    this.selfChannelId = undefined
    this.selfName = undefined
    this.selfHandle = undefined
    this.onBehalfOfUser = opts?.onBehalfOfUser
    if (opts?.identityId !== undefined) {
      this.activeIdentityId = opts.identityId
    } else if (!opts?.onBehalfOfUser) {
      this.activeIdentityId = undefined
    }
    void loadGlobalEmotes()
    this.cookie = null

    if (!cookie) {
      this.activeIdentityId = undefined
      this.onBehalfOfUser = undefined
      return null
    }

    const normalized = normalizeYoutubeCookieString(cookie)
    this.cookie = normalized

    if (!cookieHasSendAuth(normalized)) {
      console.warn(
        '[chat-service] cookie incompleto para envio (falta SAPISID/*PAPISID)',
        cookieDebugSummary(normalized)
      )
    } else {
      console.log('[chat-service] cookie OK', cookieDebugSummary(normalized))
    }

    this.yt = await Innertube.create({
      ...getYoutubeSessionLocale(app),
      cookie: normalized,
      cache: new UniversalCache(false),
      generate_session_locally: true,
      retrieve_player: false,
      ...(this.onBehalfOfUser ? { on_behalf_of_user: this.onBehalfOfUser } : {})
    })

    console.log(
      '[chat-service] innertube logged_in=',
      this.yt.session.logged_in,
      'pageId=',
      this.onBehalfOfUser || '(default)'
    )

    return this.fetchProfile()
  }

  private extractIdentitySwitchKeys(node: unknown): {
    pageId?: string
    pageIdCandidates: string[]
    channelId?: string
    apiUrl?: string
    endpointName?: string
    isDefaultIdentity: boolean
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    endpointPayload?: any
  } {
    const explicitPageIds: string[] = []
    const datasyncHeads: string[] = []
    const datasyncFull: string[] = []
    const channelIds: string[] = []
    let apiUrl: string | undefined
    let endpointName: string | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let endpointPayload: any
    let sawSignIn = false
    let sawSelectIdentity = false

    const pushUnique = (arr: string[], v: string) => {
      if (v && !arr.includes(v)) arr.push(v)
    }

    const addPageToken = (v: unknown) => {
      if (typeof v !== 'string' && typeof v !== 'number') return
      const raw = String(v).trim().replace(/\|+$/g, '')
      if (!raw || raw.length < 6 || raw.length > 220) return
      if (raw.includes('||')) {
        const head = raw.split('||')[0]!.trim()
        if (head.length >= 6) pushUnique(datasyncHeads, head)
        pushUnique(datasyncFull, raw)
      } else {
        pushUnique(explicitPageIds, raw)
      }
    }

    const harvestTokenObject = (t: Record<string, unknown>) => {
      if (t.pageId != null) addPageToken(t.pageId)
      // pageIdToken: { pageId: "…" }
      if (t.pageIdToken && typeof t.pageIdToken === 'object') {
        const p = t.pageIdToken as Record<string, unknown>
        addPageToken(p.pageId)
      }
      if (t.datasyncIdToken && typeof t.datasyncIdToken === 'object') {
        const d = t.datasyncIdToken as Record<string, unknown>
        addPageToken(d.datasyncIdToken ?? d.datasyncId)
      }
      if (typeof t.datasyncIdToken === 'string') addPageToken(t.datasyncIdToken)
      if (t.accountStateToken && typeof t.accountStateToken === 'object') {
        const st = t.accountStateToken as Record<string, unknown>
        const as = st.accountState as Record<string, unknown> | undefined
        if (as?.pageId) addPageToken(as.pageId)
      }
    }

    const harvestSelectActive = (root: unknown): void => {
      if (!root || typeof root !== 'object') return
      const stack: unknown[] = [root]
      let depth = 0
      while (stack.length && depth < 200) {
        depth++
        const cur = stack.pop()
        if (!cur || typeof cur !== 'object') continue
        if (Array.isArray(cur)) {
          for (const x of cur) stack.push(x)
          continue
        }
        const o = cur as Record<string, unknown>
        if (o.selectActiveIdentityEndpoint && typeof o.selectActiveIdentityEndpoint === 'object') {
          sawSelectIdentity = true
          endpointName = endpointName || 'selectActiveIdentityEndpoint'
          endpointPayload = o.selectActiveIdentityEndpoint
          const sel = o.selectActiveIdentityEndpoint as Record<string, unknown>
          const tokens = sel.supportedTokens
          if (Array.isArray(tokens)) {
            for (const tok of tokens) {
              if (!tok || typeof tok !== 'object') continue
              harvestTokenObject(tok as Record<string, unknown>)
            }
          }
          if (typeof sel.pageId === 'string') addPageToken(sel.pageId)
          if (Array.isArray(sel.supportedTokens)) {
            /* already harvested */
          }
        }
        if (o.signInEndpoint) {
          sawSignIn = true
          if (!endpointName) {
            endpointName = 'signInEndpoint'
            endpointPayload = o.signInEndpoint
          }
        }
        const meta = o.commandMetadata as
          | { webCommandMetadata?: { apiUrl?: string } }
          | undefined
        if (meta?.webCommandMetadata?.apiUrl && !apiUrl) {
          apiUrl = meta.webCommandMetadata.apiUrl.replace(/^\/youtubei\/v1\//, '')
        }
        if (typeof o.externalChannelId === 'string' && /^UC[\w-]{20,}$/.test(o.externalChannelId)) {
          pushUnique(channelIds, o.externalChannelId)
        }
        if (typeof o.browseId === 'string' && /^UC[\w-]{20,}$/.test(o.browseId)) {
          pushUnique(channelIds, o.browseId)
        }
        // Não descer em nextEndpoint (browse FEwhat_to_watch polui IDs)
        for (const [k, val] of Object.entries(o)) {
          if (k === 'nextEndpoint' || k === 'commandMetadata') continue
          if (val && typeof val === 'object') stack.push(val)
        }
      }
    }

    const isEmptyNode =
      node == null ||
      (typeof node === 'object' && !Array.isArray(node) && Object.keys(node as object).length === 0)

    if (!isEmptyNode) {
      harvestSelectActive(node)
    }

    if (!isEmptyNode && explicitPageIds.length === 0 && datasyncHeads.length === 0) {
      const walkLoose = (v: unknown, depth: number, key?: string): void => {
        if (depth > 10 || v == null) return
        if (typeof v === 'string') {
          const k = (key || '').toLowerCase()
          if (k === 'pageid' || k === 'datasyncid' || k === 'datasyncidtoken') addPageToken(v)
          if (k === 'externalchannelid' && /^UC[\w-]{20,}$/.test(v)) pushUnique(channelIds, v)
          return
        }
        if (Array.isArray(v)) {
          for (const x of v) walkLoose(x, depth + 1, key)
          return
        }
        if (typeof v === 'object') {
          for (const [k, val] of Object.entries(v as object)) {
            if (k === 'nextEndpoint') continue
            walkLoose(val, depth + 1, k)
          }
        }
      }
      walkLoose(node, 0)
    }

    const candidates: string[] = []
    for (const p of explicitPageIds) pushUnique(candidates, p)
    for (const p of datasyncHeads) pushUnique(candidates, p)
    for (const p of datasyncFull) pushUnique(candidates, p)

    // Default = signIn sem Brand tokens. Nó vazio = desconhecido (canal ativo sem endpoint).
    const isDefaultIdentity =
      !isEmptyNode &&
      ((sawSignIn && !sawSelectIdentity && candidates.length === 0) ||
        (sawSignIn && candidates.length === 0) ||
        // selectActive sem tokens também não é default
        (!sawSelectIdentity && !sawSignIn && candidates.length === 0 && !!endpointName))

    // Só signInEndpoint hack, sem pageId → identidade pessoal
    const isDefaultStrict =
      isDefaultIdentity || (sawSignIn && !sawSelectIdentity && candidates.length === 0)

    return {
      pageId: candidates[0],
      pageIdCandidates: candidates,
      channelId: channelIds[0],
      apiUrl,
      endpointName,
      isDefaultIdentity: isDefaultStrict,
      endpointPayload
    }
  }

  /** Perfil a partir dos metadados da identidade (quando accounts_list falha com pageId). */
  private profileFromIdentityInfo(
    info: {
      name?: string
      handle?: string
      avatarUrl?: string
      channelId?: string
      pageId?: string
    },
    fallbackName = 'Conta YouTube'
  ): UserProfile {
    const name = info.name || fallbackName
    const handle = info.handle?.replace(/^@/, '') || undefined
    this.selfName = name
    this.selfHandle = handle
    this.selfChannelId = info.channelId
    return {
      name,
      handle,
      avatarUrl: info.avatarUrl,
      channelId: info.channelId
    }
  }

  /**
   * Normaliza candidatos a pageId para X-Goog-PageId.
   * Tenta puro (só dígitos / sem ||) primeiro; datasync completo por último.
   * Descarta tokens inválidos tipo "123||" (pipes vazios no fim).
   */
  private buildPageIdCandidates(
    primary?: string,
    extra: string[] = [],
    serviceEndpoint?: unknown
  ): string[] {
    const keys = this.extractIdentitySwitchKeys(serviceEndpoint)
    const out: string[] = []
    const add = (s?: string) => {
      if (!s) return
      const t = s.trim().replace(/\|+$/g, '')
      if (!t || t.length < 6) return
      if (t.includes('||')) {
        const head = t.split('||')[0]!.trim()
        if (head.length >= 6 && !out.includes(head)) out.push(head)
        if (!out.includes(t)) out.push(t)
        return
      }
      if (!out.includes(t)) out.push(t)
    }
    add(primary)
    for (const e of extra) add(e)
    for (const e of keys.pageIdCandidates) add(e)
    // Reordena: sem || primeiro; entre puros, preferir só dígitos (pageId típico)
    out.sort((a, b) => {
      const aPipe = a.includes('||') ? 1 : 0
      const bPipe = b.includes('||') ? 1 : 0
      if (aPipe !== bPipe) return aPipe - bPipe
      const aDig = /^\d{10,}$/.test(a) ? 0 : 1
      const bDig = /^\d{10,}$/.test(b) ? 0 : 1
      return aDig - bDig
    })
    return out
  }

  private textFromRuns(node: unknown): string {
    if (!node || typeof node !== 'object') return ''
    const o = node as { simpleText?: string; runs?: Array<{ text?: string }> }
    if (typeof o.simpleText === 'string') return o.simpleText
    if (Array.isArray(o.runs)) return o.runs.map((r) => r.text || '').join('')
    return textOf(node)
  }

  /**
   * Lista canais/Brand da conta Google (CHANNEL_SWITCHER).
   * Usa JSON bruto (parse:false) para capturar pageId — o parser do youtubei
   * descarta o serviceEndpoint de sign-in (sem api_url).
   *
   * SEMPRE lista sem X-Goog-PageId (sessão bare). Com Brand ativo o YouTube
   * omite/corrompe serviceEndpoint e tokens dos outros canais — após re-login
   * isso gerava pageId que só dava 401 (ex.: haasapnas com candidates=1).
   */
  async listChannelIdentities(): Promise<YtChannelIdentity[]> {
    if (!this.cookie) {
      throw this.err('NOT_LOGGED_IN', 'Faça login para listar canais.')
    }
    if (!this.yt?.session.logged_in) {
      throw this.err('NOT_LOGGED_IN', 'Faça login para listar canais.')
    }
    this.identitySwitchInfo.clear()
    try {
      let rawRoot: unknown
      /** true = isSelected da API é o default da conta Google, não o Brand da sessão */
      const usedBareList = true
      try {
        const bare =
          this.onBehalfOfUser || !this.yt
            ? await Innertube.create({
                ...getYoutubeSessionLocale(app),
                cookie: this.cookie,
                cache: new UniversalCache(false),
                generate_session_locally: true,
                retrieve_player: false
              })
            : this.yt
        rawRoot = await this.fetchAccountsListRaw(bare)
      } catch (e) {
        // fallback: tenta com a sessão atual (pode ter pageId)
        console.warn(
          '[chat-service] accounts_list bare falhou; tentando sessão atual',
          (e as Error).message
        )
        rawRoot = await this.fetchAccountsListRaw(this.ensureYt())
      }

      const accountItems: Array<Record<string, unknown>> = []

      const walkAccounts = (node: unknown, depth: number): void => {
        if (depth > 14 || node == null) return
        if (Array.isArray(node)) {
          for (const x of node) walkAccounts(x, depth + 1)
          return
        }
        if (typeof node !== 'object') return
        const o = node as Record<string, unknown>
        if (o.accountItem && typeof o.accountItem === 'object') {
          accountItems.push(o.accountItem as Record<string, unknown>)
        }
        // formato alternativo
        if (o.accountName && (o.serviceEndpoint || o.isSelected !== undefined)) {
          accountItems.push(o)
        }
        for (const v of Object.values(o)) walkAccounts(v, depth + 1)
      }
      walkAccounts(rawRoot, 0)

      // Dedup por referência
      const unique = [...new Set(accountItems)]
      const list: YtChannelIdentity[] = []

      for (let i = 0; i < unique.length; i++) {
        const item = unique[i]!
        const name = this.textFromRuns(item.accountName) || `Canal ${i + 1}`
        const handleRaw = this.textFromRuns(item.channelHandle)
        const handle = handleRaw ? handleRaw.replace(/^@/, '') : undefined
        const byline = this.textFromRuns(item.accountByline) || undefined
        const photo = item.accountPhoto as { thumbnails?: Array<{ url?: string }> } | undefined
        const avatarUrl = photo?.thumbnails?.[0]?.url
        const hasChannel = item.hasChannel !== false
        const serviceEndpoint = item.serviceEndpoint
        // Item ativo no switcher do YT costuma NÃO trazer serviceEndpoint
        const keys = this.extractIdentitySwitchKeys(serviceEndpoint || {})
        // Canal ativo sem endpoint: default se sessão sem Brand; Brand se temos pageId
        let isDefaultIdentity = false
        if (serviceEndpoint) {
          isDefaultIdentity = keys.isDefaultIdentity
        } else if (item.isSelected) {
          isDefaultIdentity = !this.onBehalfOfUser
        }
        // Canal "pessoal" da conta Google = o que aparece no getInfo SEM pageId.
        // Tem selectActiveIdentity + pageId numérico no token, mas usar esse pageId
        // como X-Goog-PageId dá 401. handle do bare bate com esse item.
        if (
          !this.onBehalfOfUser &&
          this.selfHandle &&
          handle &&
          normName(this.selfHandle) === normName(handle)
        ) {
          isDefaultIdentity = true
        }

        let pageId = keys.pageId
        let pageIdCandidates = [...keys.pageIdCandidates]
        // Propaga pageId da sessão no item ativo (Brand sem endpoint no JSON)
        if (!pageId && item.isSelected && this.onBehalfOfUser) {
          pageId = this.onBehalfOfUser
          pageIdCandidates = [this.onBehalfOfUser]
        }
        // Default pessoal: NÃO usar pageId do token (gera 401). Brand real mantém.
        if (isDefaultIdentity) {
          pageId = undefined
          pageIdCandidates = []
        }

        const id =
          keys.channelId ||
          handle ||
          pageId ||
          (isDefaultIdentity ? 'default' : `ch-${i}`)

        // isSelected: prioriza activeIdentityId / pageId da sessão
        let isSelected = false
        if (this.activeIdentityId && this.activeIdentityId === id) {
          isSelected = true
        } else if (this.onBehalfOfUser && pageId) {
          isSelected =
            pageId === this.onBehalfOfUser || pageIdCandidates[0] === this.onBehalfOfUser
        } else if (this.onBehalfOfUser && isDefaultIdentity) {
          isSelected = false
        } else if (!this.onBehalfOfUser && isDefaultIdentity) {
          isSelected = true
        } else if (!usedBareList) {
          isSelected = !!item.isSelected
        } else {
          isSelected = !this.onBehalfOfUser && !!item.isSelected
        }

        this.identitySwitchInfo.set(id, {
          pageId,
          pageIdCandidates,
          isDefaultIdentity,
          channelId: keys.channelId,
          isSelected,
          name,
          handle,
          avatarUrl,
          serviceEndpoint,
          navEndpoint: null
        })

        list.push({
          id,
          name,
          handle,
          avatarUrl,
          byline,
          isSelected,
          hasChannel
        })

        console.log(
          `[chat-service] identity[${i}] id=${id} name=${name} handle=${handle || '—'} selected=${isSelected} default=${isDefaultIdentity} pageId=${
            pageId ? pageId.slice(0, 24) + (pageId.length > 24 ? '…' : '') : '∅'
          } candidates=${pageIdCandidates.length}`
        )
      }

      // Garante no máximo um selected (activeIdentityId manda)
      if (this.activeIdentityId) {
        for (const row of list) {
          row.isSelected = row.id === this.activeIdentityId
          const info = this.identitySwitchInfo.get(row.id)
          if (info) info.isSelected = row.isSelected
        }
      } else {
        const selectedRows = list.filter((r) => r.isSelected)
        if (selectedRows.length > 1) {
          // mantém o que tem pageId = onBehalf, senão o primeiro
          const keep =
            selectedRows.find(
              (r) =>
                this.onBehalfOfUser &&
                this.identitySwitchInfo.get(r.id)?.pageId === this.onBehalfOfUser
            ) || selectedRows[0]!
          for (const row of list) {
            row.isSelected = row.id === keep.id
            const info = this.identitySwitchInfo.get(row.id)
            if (info) info.isSelected = row.isSelected
          }
        }
        const sel = list.find((r) => r.isSelected)
        if (sel) this.activeIdentityId = sel.id
      }

      // 2) Fallback: parser youtubei (sem pageId, mas lista nomes)
      if (list.length === 0) {
        const items = await this.ensureYt().account.getInfo(true)
        for (const item of items) {
          const name = textOf(item.account_name) || 'Canal'
          const handle = textOf(item.channel_handle)?.replace(/^@/, '') || undefined
          const byline = textOf(item.account_byline) || undefined
          const avatarUrl = item.account_photo?.[0]?.url
          const keys = this.extractIdentitySwitchKeys(item.endpoint?.payload)
          const id = keys.channelId || handle || `ch-${list.length}`
          const isSelected = this.activeIdentityId
            ? this.activeIdentityId === id
            : !!item.is_selected
          this.identitySwitchInfo.set(id, {
            pageId: keys.pageId,
            pageIdCandidates: keys.pageIdCandidates,
            isDefaultIdentity: keys.isDefaultIdentity,
            channelId: keys.channelId,
            isSelected,
            name,
            handle,
            avatarUrl,
            serviceEndpoint: item.endpoint?.payload,
            navEndpoint: item.endpoint
          })
          list.push({
            id,
            name,
            handle,
            avatarUrl,
            byline,
            isSelected,
            hasChannel: item.has_channel !== false
          })
        }
      }

      console.log(
        `[chat-service] identidades: ${list.length} · ativa=${
          list.find((c) => c.isSelected)?.name || '?'
        } · activeId=${this.activeIdentityId || '∅'} pageId=${this.onBehalfOfUser || '(default)'}`
      )
      return list
    } catch (e) {
      console.warn('[chat-service] listChannelIdentities failed', e)
      throw this.err(
        'UNKNOWN',
        (e as Error).message || 'Não foi possível listar os canais da conta.'
      )
    }
  }

  private async fetchAccountsListRaw(yt: Innertube): Promise<unknown> {
    const rawRes = (await yt.session.actions.execute('account/accounts_list', {
      requestType: 'ACCOUNTS_LIST_REQUEST_TYPE_CHANNEL_SWITCHER',
      callCircumstance: 'SWITCHING_USERS_FULL',
      client: 'WEB',
      parse: false
    })) as { data?: unknown }
    return rawRes.data ?? rawRes
  }

  /** Handle/channelId do perfil remoto bate com a identidade do switcher? */
  private identityMatchesProfile(
    info: {
      name?: string
      handle?: string
      channelId?: string
    },
    profile: UserProfile | null | undefined
  ): boolean {
    if (!profile?.name || profile.name === 'Logado no YouTube') return false
    if (
      info.handle &&
      profile.handle &&
      normName(info.handle) === normName(profile.handle)
    ) {
      return true
    }
    if (info.channelId && profile.channelId && info.channelId === profile.channelId) {
      return true
    }
    return false
  }

  /**
   * Troca o canal Brand ativo (mesma conta Google).
   * - Canal pessoal (default) → SEM X-Goog-PageId
   * - Brand → onBehalfOfUser com pageId
   *
   * haasapnas = canal default da conta Google. O switcher manda um pageId nos
   * tokens, mas usá-lo como X-Goog-PageId dá 401. Solução: ficar bare.
   */
  async switchChannelIdentity(identityId: string): Promise<UserProfile | null> {
    if (!this.cookie) throw this.err('NOT_LOGGED_IN', 'Sem cookie de sessão.')

    // Lista (bare por baixo) com tokens de todos os canais
    await this.listChannelIdentities()
    let info = this.identitySwitchInfo.get(identityId)
    if (!info) {
      throw this.err('UNKNOWN', 'Canal não encontrado na lista da conta.')
    }

    let keys = this.extractIdentitySwitchKeys(info.serviceEndpoint || {})
    let candidates = this.buildPageIdCandidates(
      info.pageId,
      info.pageIdCandidates || keys.pageIdCandidates,
      info.serviceEndpoint
    )
    // Default = identidade pessoal (sem Brand). Inclui flag da lista bare.
    let isDefault =
      info.isDefaultIdentity === true ||
      (keys.isDefaultIdentity && !info.pageId && candidates.length === 0) ||
      (!info.pageId &&
        candidates.length === 0 &&
        !this.onBehalfOfUser &&
        info.isSelected)

    // Já é o canal ativo?
    if (this.activeIdentityId === identityId) {
      console.log('[chat-service] canal já ativo (mesmo id)', identityId)
      return this.profileFromIdentityInfo(
        { ...info, channelId: info.channelId || keys.channelId },
        info.name || 'Conta YouTube'
      )
    }
    if (
      !isDefault &&
      this.onBehalfOfUser &&
      candidates[0] === this.onBehalfOfUser
    ) {
      console.log('[chat-service] canal já ativo (mesmo pageId)', identityId)
      this.activeIdentityId = identityId
      return this.profileFromIdentityInfo(
        { ...info, channelId: info.channelId || keys.channelId },
        info.name || 'Conta YouTube'
      )
    }
    if (isDefault && !this.onBehalfOfUser && this.activeIdentityId === identityId) {
      return this.profileFromIdentityInfo(
        { ...info, channelId: info.channelId || keys.channelId },
        info.name || 'Conta YouTube'
      )
    }

    const prevPageId = this.onBehalfOfUser
    const prevIdentityId = this.activeIdentityId

    console.log(
      `[chat-service] switch → id=${identityId} default=${isDefault} fromPageId=${
        prevPageId?.slice(0, 16) || '(default)'
      } fromId=${prevIdentityId || '∅'} candidates=${
        candidates.map((c) => c.slice(0, 16) + (c.length > 16 ? '…' : '')).join('|') || '∅'
      }`
    )

    // Para pollers, MAS mantém abas — depois do switch rejoin/restore
    this.deps.stopAllPollers()

    // ── Sempre bare primeiro ──────────────────────────────────────────────
    // 1) Canal default = o perfil bare (sem pageId)
    // 2) Brand = precisa sair do Brand atual antes de aplicar outro pageId
    let bareProfile: UserProfile | null = null
    if (this.onBehalfOfUser || isDefault) {
      console.log(
        '[chat-service] drop → bare',
        prevPageId ? prevPageId.slice(0, 16) : '(já bare)'
      )
      bareProfile = await this.initWithCookie(this.cookie)
    } else if (this.lastProfileFromRemote && this.selfName) {
      bareProfile = {
        name: this.selfName,
        handle: this.selfHandle,
        channelId: this.selfChannelId
      }
    } else {
      bareProfile = await this.initWithCookie(this.cookie)
    }

    // Re-lista com selfHandle do bare → marca default certo (ex.: haasapnas)
    await this.listChannelIdentities()
    info = this.identitySwitchInfo.get(identityId) || info
    keys = this.extractIdentitySwitchKeys(info.serviceEndpoint || {})
    isDefault =
      info.isDefaultIdentity === true ||
      this.identityMatchesProfile(info, bareProfile)

    // ── Canal pessoal / default: FICA bare (sem pageId) ───────────────────
    if (isDefault || this.identityMatchesProfile(info, bareProfile)) {
      this.activeIdentityId = identityId
      this.onBehalfOfUser = undefined
      const profile = this.profileFromIdentityInfo(
        {
          name: info.name,
          handle: info.handle,
          avatarUrl: info.avatarUrl,
          channelId: info.channelId || keys.channelId
        },
        info.name || 'Conta YouTube'
      )
      let out: UserProfile = profile
      if (bareProfile && this.identityMatchesProfile(info, bareProfile)) {
        console.log(
          '[chat-service] switch→default (bare = canal alvo)',
          bareProfile.name,
          bareProfile.handle
        )
        out = bareProfile
      } else {
        const remote = await this.fetchProfileSafe()
        if (remote && remote.name && remote.name !== 'Logado no YouTube') {
          console.log('[chat-service] switch→default remoto', remote.name, remote.handle)
          out = remote
        } else {
          console.log('[chat-service] switch→default meta', profile.name, profile.handle)
        }
      }
      await this.deps.rejoinSessionsAfterAuth()
      return out
    }

    // ── Brand: pageId a partir da sessão bare ─────────────────────────────
    candidates = this.buildPageIdCandidates(
      info.pageId,
      info.pageIdCandidates || keys.pageIdCandidates,
      info.serviceEndpoint
    )
    // Nunca reaplicar pageId que é o "falso" do default (mesmo que ainda esteja no token)
    if (bareProfile?.handle && info.handle) {
      /* candidates já limpos se isDefaultIdentity na lista */
    }
    console.log(
      `[chat-service] switch bare→Brand candidates=${
        candidates.map((c) => c.slice(0, 18) + (c.length > 18 ? '…' : '')).join('|') || '∅'
      } endpoint=${keys.endpointName || '∅'} api=${keys.apiUrl || '∅'}`
    )

    if (candidates.length === 0) {
      // Sem pageId e não bateu bare = não dá para ativar como Brand
      try {
        await this.initWithCookie(
          this.cookie,
          prevPageId ? { onBehalfOfUser: prevPageId } : undefined
        )
        this.activeIdentityId = prevIdentityId
      } catch {
        /* ignore */
      }
      try {
        await this.deps.rejoinSessionsAfterAuth()
      } catch {
        /* ignore */
      }
      throw this.err(
        'UNKNOWN',
        'Este canal não tem pageId Brand utilizável. Tente “Trocar canal YouTube…” no menu.'
      )
    }

    await this.trySelectActiveIdentity(keys)

    let lastErr: unknown
    for (let i = 0; i < candidates.length; i++) {
      const pageId = candidates[i]!
      const isLast = i === candidates.length - 1
      try {
        console.log(
          `[chat-service] init com pageId=${pageId.slice(0, 28)}${pageId.length > 28 ? '…' : ''} (${i + 1}/${candidates.length})`
        )
        const initProfile = await this.initWithCookie(this.cookie, {
          onBehalfOfUser: pageId
        })
        if (!this.yt?.session.logged_in) {
          lastErr = new Error('sessão não autenticada com este pageId')
          console.warn('[chat-service] pageId sem sessão logada')
          continue
        }

        const remoteFromInit =
          this.lastProfileFromRemote &&
          !!initProfile &&
          !!initProfile.name &&
          initProfile.name !== 'Logado no YouTube'

        if (!remoteFromInit) {
          const probe = await this.probePageIdWorks()
          if (!probe.ok) {
            console.warn(
              `[chat-service] pageId rejeitado (probe) reason=${probe.reason} last=${isLast}`
            )
            lastErr = new Error(
              probe.reason === 'unauth'
                ? 'sessão sem autenticação para este canal (401)'
                : 'pageId probe failed'
            )
            continue
          }
        } else {
          const smoke = await this.smokeTestAuthedPlayer()
          if (!smoke.ok) {
            console.warn(
              `[chat-service] pageId com profile ok mas smoke falhou: ${smoke.reason}`
            )
            lastErr = new Error(
              smoke.reason === 'unauth'
                ? 'sessão sem autenticação para este canal (401)'
                : 'pageId smoke failed'
            )
            continue
          }
        }

        this.activeIdentityId = identityId
        const profile = this.profileFromIdentityInfo(
          {
            name: info.name,
            handle: info.handle,
            avatarUrl: info.avatarUrl,
            channelId: info.channelId || keys.channelId
          },
          info.name || 'Conta YouTube'
        )

        let remote: UserProfile | null = remoteFromInit ? initProfile : null
        if (!remote) {
          remote = await this.fetchProfileSafe()
        }
        if (
          remote &&
          remote.name &&
          remote.name !== 'Logado no YouTube' &&
          (this.identityMatchesProfile(info, remote) ||
            !info.handle ||
            normName(remote.name) === normName(info.name || ''))
        ) {
          console.log(
            '[chat-service] após switch remoto',
            remote.name,
            remote.handle,
            'pageId=',
            pageId.slice(0, 20)
          )
          await this.deps.rejoinSessionsAfterAuth()
          return remote
        }
        console.log(
          '[chat-service] após switch meta',
          profile.name,
          profile.handle,
          'pageId=',
          pageId.slice(0, 20)
        )
        await this.deps.rejoinSessionsAfterAuth()
        return profile
      } catch (e) {
        lastErr = e
        console.warn('[chat-service] candidato pageId falhou', (e as Error).message)
      }
    }

    // Restaura sessão anterior (pageId de antes do loop, não o último candidato)
    try {
      await this.initWithCookie(
        this.cookie,
        prevPageId ? { onBehalfOfUser: prevPageId } : undefined
      )
      this.activeIdentityId = prevIdentityId
    } catch {
      try {
        await this.initWithCookie(this.cookie)
        this.activeIdentityId = undefined
      } catch {
        /* ignore */
      }
    }
    // Mesmo em falha, devolve as abas (paramos os pollers no início)
    try {
      await this.deps.rejoinSessionsAfterAuth()
    } catch {
      /* ignore */
    }

    const detail = lastErr instanceof Error ? lastErr.message : ''
    const unauth = /401|sem autenticação|UNAUTHENTICATED/i.test(detail)
    throw this.err(
      unauth ? 'NOT_LOGGED_IN' : 'UNKNOWN',
      unauth
        ? 'YouTube recusou este canal Brand (401) após o login. No menu da conta use “Trocar canal” (seletor do YouTube), escolha o canal e confirme — ou saia e entre de novo já nesse canal.'
        : `YouTube rejeitou a troca de canal. ${detail}`.trim()
    )
  }

  /**
   * Chama o endpoint de troca de identidade (selectActiveIdentity) quando o YT
   * expõe apiUrl. Roda na sessão bare; falha é ok (seguimos com pageId).
   */
  private async trySelectActiveIdentity(keys: {
    apiUrl?: string
    endpointName?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    endpointPayload?: any
  }): Promise<void> {
    if (!this.yt || !keys.endpointPayload) return

    const attempts: Array<{ label: string; path: string; body: Record<string, unknown> }> =
      []
    if (keys.apiUrl) {
      attempts.push({
        label: keys.endpointName || keys.apiUrl,
        path: keys.apiUrl,
        body: { ...keys.endpointPayload }
      })
    }
    // Fallback comum do CHANNEL_SWITCHER quando não há apiUrl no metadata
    if (keys.endpointName === 'selectActiveIdentityEndpoint' || keys.endpointPayload) {
      attempts.push({
        label: 'selectActiveIdentity(wrapped)',
        path: 'account/accounts_list',
        body: {
          selectActiveIdentityEndpoint: keys.endpointPayload,
          requestType: 'ACCOUNTS_LIST_REQUEST_TYPE_CHANNEL_SWITCHER',
          callCircumstance: 'SWITCHING_USERS_FULL'
        }
      })
    }

    for (const a of attempts) {
      try {
        console.log('[chat-service] tentando identity endpoint', a.label, a.path)
        await this.yt.session.actions.execute(a.path, {
          ...a.body,
          client: 'WEB',
          parse: false
        })
        console.log('[chat-service] identity endpoint OK', a.label)
        return
      } catch (e) {
        console.warn(
          '[chat-service] identity endpoint falhou',
          a.label,
          (e as Error).message
        )
      }
    }
  }

  /** true se o último fetchProfile veio da API (não cache). */
  hadRemoteProfile(): boolean {
    return this.lastProfileFromRemote
  }

  /**
   * Valida se a sessão atual (cookie + pageId) autentica de verdade.
   * Usado no switch de Brand e ao restaurar slot com pageId salvo.
   */
  async validateSessionAuth(): Promise<{ ok: boolean; reason: string }> {
    if (!this.yt?.session.logged_in) {
      return { ok: false, reason: 'not_logged_in' }
    }
    if (this.lastProfileFromRemote) {
      const smoke = await this.smokeTestAuthedPlayer()
      if (smoke.ok) return { ok: true, reason: 'remote+smoke' }
      return smoke
    }
    return this.probePageIdWorks()
  }

  isUnauthError(e: unknown): boolean {
    const msg =
      e instanceof Error
        ? `${e.message} ${JSON.stringify((e as { info?: string }).info || '')}`
        : String(e)
    return /401|UNAUTHENTICATED|unauthorized|missing required authentication/i.test(
      msg
    )
  }

  /**
   * Smoke barato: player/next em vídeo público.
   * Se a sessão manda cookie inválido + pageId morto → 401 (não confundir com 500 flaky).
   */
  private async smokeTestAuthedPlayer(): Promise<{ ok: boolean; reason: string }> {
    if (!this.yt) return { ok: false, reason: 'no_yt' }
    // "Me at the zoo" — vídeo público estável; 401 = credencial rejeitada
    const PUBLIC_VIDEO = 'jNQXAC9IVRw'
    try {
      await this.yt.getBasicInfo(PUBLIC_VIDEO)
      return { ok: true, reason: 'player_ok' }
    } catch (e) {
      if (this.isUnauthError(e)) return { ok: false, reason: 'unauth' }
      // Outros erros (rede, parse) não invalidam o pageId sozinhos
      console.warn(
        '[chat-service] smoke player erro não-401 (ignorado):',
        (e as Error).message
      )
      return { ok: true, reason: 'player_other_error' }
    }
  }

  /**
   * Valida se a sessão com pageId atual responde de verdade.
   * - 401 → fail hard (Brand deslogado / cookie morto)
   * - 500 accounts_list → retry; depois getInfo; depois smoke player
   * Nunca soft-accept só com logged_in (causava 401 no open/restore).
   */
  private async probePageIdWorks(): Promise<{ ok: boolean; reason: string }> {
    if (!this.yt) return { ok: false, reason: 'no_yt' }

    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

    // 1) accounts_list com retry (500 transitório pós re-login)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.yt.session.actions.execute('account/accounts_list', {
          requestType: 'ACCOUNTS_LIST_REQUEST_TYPE_CHANNEL_SWITCHER',
          callCircumstance: 'SWITCHING_USERS_FULL',
          client: 'WEB',
          parse: false
        })
        return { ok: true, reason: 'accounts_list' }
      } catch (e) {
        if (this.isUnauthError(e)) return { ok: false, reason: 'unauth' }
        const msg = (e as Error).message || String(e)
        const retriable = /500|INTERNAL|backendError|Internal error/i.test(msg)
        if (!retriable || attempt === 2) break
        await sleep(200 * (attempt + 1))
      }
    }

    // 2) getInfo
    try {
      const items = await this.yt.account.getInfo(true)
      if (items && items.length > 0) {
        this.lastProfileFromRemote = true
        return { ok: true, reason: 'getInfo' }
      }
    } catch (e) {
      if (this.isUnauthError(e)) return { ok: false, reason: 'unauth' }
    }

    // 3) player smoke — pega 401 que accounts_list às vezes mascara como 500
    return this.smokeTestAuthedPlayer()
  }

  /** fetchProfile que não engole erro com "Logado no YouTube" genérico. */
  private async fetchProfileSafe(): Promise<UserProfile | null> {
    if (!this.yt) return null
    try {
      // Sempre true com on_behalf_of_user (exigência do youtubei.js)
      const items = await this.yt.account.getInfo(true)
      const selected = items.find((i) => i.is_selected) || items[0]
      if (!selected) return null
      const name = textOf(selected.account_name) || 'Conta YouTube'
      const handle = textOf(selected.channel_handle) || undefined
      const avatarUrl = selected.account_photo?.[0]?.url
      const channelId =
        (selected.endpoint?.payload as { browseId?: string } | undefined)?.browseId || undefined
      this.selfChannelId = channelId
      this.selfName = name
      this.selfHandle = handle?.replace(/^@/, '') || undefined
      return { name, handle: this.selfHandle, avatarUrl, channelId }
    } catch {
      return null
    }
  }

  /** Atualiza cookies da sessão Electron → Innertube (sem perder abas). */
  async refreshAuthCookie(): Promise<boolean> {
    const fresh = await collectYoutubeCookieString()
    if (!fresh || !cookieHasSendAuth(fresh)) return false
    const normalized = normalizeYoutubeCookieString(fresh)
    if (normalized === this.cookie && this.yt) return true

    // HTTPClient guarda cookie no construtor — precisa recriar Innertube
    this.deps.stopAllPollers()
    await this.initWithCookie(normalized, {
      onBehalfOfUser: this.onBehalfOfUser,
      identityId: this.activeIdentityId
    })
    await this.deps.rejoinSessionsAfterAuth()
    return !!this.yt
  }

  async fetchProfile(): Promise<UserProfile | null> {
    if (!this.yt) return null
    this.lastProfileFromRemote = false
    try {
      // getInfo(true) obrigatório quando on_behalf_of_user está setado
      const items = await this.yt.account.getInfo(true)
      const selected = items.find((i) => i.is_selected) || items[0]
      if (!selected) {
        return this.profileFromCachedIdentity() || { name: 'Logado no YouTube' }
      }

      const name = textOf(selected.account_name) || 'Conta YouTube'
      const handle = textOf(selected.channel_handle) || undefined
      const avatarUrl = selected.account_photo?.[0]?.url
      const channelId =
        (selected.endpoint?.payload as { browseId?: string } | undefined)?.browseId || undefined

      this.selfChannelId = channelId
      this.selfName = name
      this.selfHandle = handle?.replace(/^@/, '') || undefined
      this.lastProfileFromRemote = true
      console.log(
        '[chat-service] profile',
        JSON.stringify({ name, handle: this.selfHandle, channelId })
      )
      return { name, handle: this.selfHandle, avatarUrl, channelId }
    } catch (err) {
      console.warn('[chat-service] fetchProfile failed', err)
      // NUNCA getInfo(false) com on_behalf_of_user — youtubei lança de propósito
      if (!this.onBehalfOfUser) {
        try {
          const info = await this.yt.account.getInfo(false)
          const section = info.contents
          const first = section?.contents?.find((c) => c.type === 'AccountItem') as
            | YTNodes.AccountItem
            | undefined
          if (first) {
            const name = textOf(first.account_name) || 'Conta YouTube'
            const handle = textOf(first.channel_handle) || undefined
            const avatarUrl = first.account_photo?.[0]?.url
            const channelId =
              (first.endpoint?.payload as { browseId?: string } | undefined)?.browseId || undefined
            this.selfChannelId = channelId
            this.selfName = name
            this.selfHandle = handle?.replace(/^@/, '') || undefined
            this.lastProfileFromRemote = true
            return { name, handle: this.selfHandle, avatarUrl, channelId }
          }
        } catch (err2) {
          console.warn('[chat-service] fetchProfile fallback failed', err2)
        }
      }
      const cached = this.profileFromCachedIdentity()
      if (cached) {
        console.log('[chat-service] profile from identity cache', cached.name)
        return cached
      }
      this.selfName = 'Logado no YouTube'
      return { name: this.selfName }
    }
  }

  /** Usa metadados da identidade cujo pageId bate com a sessão atual. */
  private profileFromCachedIdentity(): UserProfile | null {
    if (!this.onBehalfOfUser) return null
    for (const info of this.identitySwitchInfo.values()) {
      const cands = info.pageIdCandidates || (info.pageId ? [info.pageId] : [])
      if (info.pageId === this.onBehalfOfUser || cands.includes(this.onBehalfOfUser)) {
        return this.profileFromIdentityInfo(info, info.name || 'Conta YouTube')
      }
    }
    return null
  }

  async clear(): Promise<void> {
    this.deps.stopLiveWatch()
    this.deps.stopChat()
    this.yt = null
    this.cookie = null
    this.selfChannelId = undefined
    this.selfName = undefined
    this.selfHandle = undefined
    this.onBehalfOfUser = undefined
    this.activeIdentityId = undefined
    this.lastProfileFromRemote = false
    this.identitySwitchInfo.clear()
    this.deps.clearChatState()


  }

  private ensureYt(): Innertube {
    if (!this.yt) {
      throw this.err(
        'NOT_LOGGED_IN',
        'Faca login com o YouTube primeiro.'
      )
    }
    return this.yt
  }

  private err(
    code: AppError['code'],
    message: string
  ): AppError & Error {
    const error = new Error(message) as Error & AppError
    error.code = code
    error.message = message
    error.messageKey = ({
      NOT_LOGGED_IN: 'errors.loginRequired',
      CHANNEL_NOT_FOUND: 'errors.channelNotFound',
      NOT_LIVE: 'errors.notLive',
      CHAT_UNAVAILABLE: 'errors.chatUnavailable',
      SEND_FAILED: 'errors.sendFailed',
      NETWORK_ERROR: 'errors.network',
      AUTH_FAILED: 'errors.authFailed',
      UNKNOWN: 'errors.unknown'
    } as Record<AppError['code'], string>)[code]
    return error
  }
}
import { Innertube, UniversalCache, YTNodes } from 'youtubei.js'
import { app } from 'electron'
import {
  collectYoutubeCookieString,
  cookieDebugSummary,
  cookieHasSendAuth,
  normalizeYoutubeCookieString
} from '../auth'
import { textOf } from '../chat/message-parser'
import { normName } from '../chat/channel-parser'
import { loadGlobalEmotes } from '../emotes/seventv'
import type {
  AppError,
  UserProfile,
  YtChannelIdentity
} from '../../shared/types'
import { InnertubeSession } from './innertube-session'
import { getYoutubeSessionLocale } from './youtube-session-locale'
