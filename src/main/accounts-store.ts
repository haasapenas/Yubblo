/**
 * Várias contas / canais YouTube salvos no PC.
 * Cada slot = cookie + perfil + pageId Brand opcional.
 * A conta ativa é a que o chat usa.
 */
import { app, safeStorage } from 'electron'
import { createHash, randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { UserProfile } from '../shared/types'
import { saveCookieString, clearSession, loadCookieString } from './session-store'

const FILE_NAME = 'accounts.enc'

export interface StoredAccount {
  /** id estável do slot (não muda com handle/canal) */
  id: string
  profile: UserProfile
  cookie: string
  lastUsed: number
  /**
   * X-Goog-PageId / on_behalf_of_user do Brand ativo neste slot.
   * Sem isso, trocar de “conta” que é o mesmo cookie Google volta sempre ao canal default.
   */
  pageId?: string
  /** id da identidade no switcher (ch-… / handle / UC…) */
  identityId?: string
}

export interface AccountsFile {
  version: 1
  activeId: string | null
  accounts: StoredAccount[]
}

function dir(): string {
  const d = app.getPath('userData')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function filePath(): string {
  return join(dir(), FILE_NAME)
}

function encrypt(text: string): Buffer {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(text)
  }
  return Buffer.from(text, 'utf8')
}

function decrypt(buf: Buffer): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(buf)
  }
  return buf.toString('utf8')
}

function empty(): AccountsFile {
  return { version: 1, activeId: null, accounts: [] }
}

function newAccountId(): string {
  return `acc-${randomBytes(8).toString('hex')}`
}

/** Resumo do cookie para log (não é secreto completo). */
export function cookieFingerprint(cookie: string): string {
  const h = createHash('sha256').update(cookie).digest('hex').slice(0, 10)
  const hasSid = /(?:^|;\s*)(?:SID|__Secure-1PSID)=/.test(cookie)
  return `${h}${hasSid ? '+sid' : ''}`
}

export function loadAccountsFile(): AccountsFile {
  const path = filePath()
  if (!existsSync(path)) {
    return empty()
  }
  try {
    const raw = decrypt(readFileSync(path))
    const parsed = JSON.parse(raw) as AccountsFile
    if (!Array.isArray(parsed.accounts)) return empty()
    return {
      version: 1,
      activeId: parsed.activeId ?? null,
      accounts: parsed.accounts
        .filter((a) => a && typeof a.id === 'string' && typeof a.cookie === 'string')
        .map((a) => ({
          id: a.id,
          profile: a.profile || { name: 'Conta' },
          cookie: a.cookie,
          lastUsed: a.lastUsed || 0,
          pageId: a.pageId,
          identityId: a.identityId
        }))
    }
  } catch (e) {
    console.warn('[accounts-store] load failed', e)
    return empty()
  }
}

export function saveAccountsFile(data: AccountsFile): void {
  try {
    const normalized: AccountsFile = {
      version: 1,
      activeId: data.activeId,
      accounts: data.accounts.map((a) => ({
        id: a.id,
        profile: a.profile,
        cookie: a.cookie,
        lastUsed: a.lastUsed,
        ...(a.pageId ? { pageId: a.pageId } : {}),
        ...(a.identityId ? { identityId: a.identityId } : {})
      }))
    }
    writeFileSync(filePath(), encrypt(JSON.stringify(normalized)))
  } catch (e) {
    console.warn('[accounts-store] save failed', e)
  }
}

export function listAccounts(): Array<{
  id: string
  profile: UserProfile
  lastUsed: number
  active: boolean
  hasBrandPageId: boolean
}> {
  const file = loadAccountsFile()
  return file.accounts
    .map((a) => ({
      id: a.id,
      profile: a.profile,
      lastUsed: a.lastUsed,
      active: a.id === file.activeId,
      hasBrandPageId: !!a.pageId
    }))
    .sort((a, b) => b.lastUsed - a.lastUsed)
}

export function getActiveAccount(): StoredAccount | null {
  const file = loadAccountsFile()
  if (!file.activeId) return file.accounts[0] || null
  return file.accounts.find((a) => a.id === file.activeId) || file.accounts[0] || null
}

export function getAccountById(id: string): StoredAccount | null {
  const file = loadAccountsFile()
  return file.accounts.find((a) => a.id === id) || null
}

export function getAccountCookie(id: string): string | null {
  return getAccountById(id)?.cookie ?? null
}

export type AccountBrandState = {
  pageId?: string | null
  identityId?: string | null
}

/**
 * Atualiza um slot existente (troca de conta / Brand / refresh).
 * Nunca cria outro slot nem muda o id.
 */
export function updateAccount(
  id: string,
  patch: {
    profile?: UserProfile
    cookie?: string
    pageId?: string | null
    identityId?: string | null
    setActive?: boolean
  }
): StoredAccount | null {
  const file = loadAccountsFile()
  const idx = file.accounts.findIndex((a) => a.id === id)
  if (idx < 0) return null
  const prev = file.accounts[idx]!
  const next: StoredAccount = {
    ...prev,
    lastUsed: Date.now()
  }
  if (patch.profile) next.profile = { ...patch.profile }
  if (patch.cookie) next.cookie = patch.cookie
  if (patch.pageId !== undefined) {
    next.pageId = patch.pageId || undefined
  }
  if (patch.identityId !== undefined) {
    next.identityId = patch.identityId || undefined
  }
  file.accounts[idx] = next
  if (patch.setActive !== false) {
    file.activeId = id
  }
  saveAccountsFile(file)
  if (patch.cookie) saveCookieString(patch.cookie)
  else saveCookieString(next.cookie)
  console.log(
    `[accounts-store] update id=${id} name=${next.profile.name} pageId=${
      next.pageId ? next.pageId.slice(0, 16) + '…' : '(default)'
    } fp=${cookieFingerprint(next.cookie)}`
  )
  return next
}

/**
 * Novo slot (Adicionar conta). Sempre id novo — não mescla por handle.
 */
export function addAccountEntry(
  profile: UserProfile,
  cookie: string,
  brand?: AccountBrandState
): StoredAccount {
  const file = loadAccountsFile()
  const entry: StoredAccount = {
    id: newAccountId(),
    profile: { ...profile },
    cookie,
    lastUsed: Date.now(),
    pageId: brand?.pageId || undefined,
    identityId: brand?.identityId || undefined
  }
  file.accounts.push(entry)
  file.activeId = entry.id
  saveAccountsFile(file)
  saveCookieString(cookie)
  console.log(
    `[accounts-store] add id=${entry.id} name=${profile.name} fp=${cookieFingerprint(cookie)} total=${file.accounts.length}`
  )
  return entry
}

/**
 * Login / bootstrap: atualiza a conta ativa, ou cria a primeira.
 * NÃO cria conta extra se já há activeId (evita duplicar no Brand switch).
 */
export function upsertActiveAccount(
  profile: UserProfile,
  cookie: string,
  brand?: AccountBrandState
): StoredAccount {
  const file = loadAccountsFile()
  if (file.activeId) {
    const updated = updateAccount(file.activeId, {
      profile,
      cookie,
      pageId: brand?.pageId,
      identityId: brand?.identityId,
      setActive: true
    })
    if (updated) return updated
  }
  if (file.accounts.length === 0) {
    return addAccountEntry(profile, cookie, brand)
  }
  // Sem activeId mas há contas: usa a primeira
  const first = file.accounts[0]!
  file.activeId = first.id
  saveAccountsFile(file)
  return (
    updateAccount(first.id, {
      profile,
      cookie,
      pageId: brand?.pageId,
      identityId: brand?.identityId,
      setActive: true
    }) || first
  )
}

/**
 * Encontra ou cria um slot para (mesmo cookie Google + pageId Brand).
 * Assim "Haasapenas" e o Brand viram duas entradas no menu e dá para voltar.
 */
export function upsertIdentityAccount(
  profile: UserProfile,
  cookie: string,
  brand?: AccountBrandState
): StoredAccount {
  const file = loadAccountsFile()
  const fp = cookieFingerprint(cookie)
  const wantPage = brand?.pageId || ''
  const wantIdentity = brand?.identityId || ''
  const wantChannel = profile.channelId || ''
  const wantHandle = (profile.handle || '').toLowerCase()

  const idx = file.accounts.findIndex((a) => {
    if (cookieFingerprint(a.cookie) !== fp) return false
    const aPage = a.pageId || ''
    if (aPage !== wantPage) return false
    if (wantIdentity && a.identityId && a.identityId === wantIdentity) return true
    if (wantChannel && a.profile.channelId && a.profile.channelId === wantChannel) return true
    if (wantHandle && a.profile.handle?.toLowerCase() === wantHandle) return true
    // mesmo cookie + mesmo pageId (ambos default ou mesmo Brand)
    return aPage === wantPage
  })

  if (idx >= 0) {
    return (
      updateAccount(file.accounts[idx]!.id, {
        profile,
        cookie,
        pageId: brand?.pageId ?? null,
        identityId: brand?.identityId ?? null,
        setActive: true
      }) || file.accounts[idx]!
    )
  }

  return addAccountEntry(profile, cookie, brand)
}

/** @deprecated use upsertActiveAccount / addAccountEntry / updateAccount */
export function upsertAccount(profile: UserProfile, cookie: string): StoredAccount {
  return upsertActiveAccount(profile, cookie)
}

export function setActiveAccount(id: string): StoredAccount | null {
  const file = loadAccountsFile()
  const acc = file.accounts.find((a) => a.id === id)
  if (!acc) return null
  file.activeId = id
  acc.lastUsed = Date.now()
  saveAccountsFile(file)
  saveCookieString(acc.cookie)
  console.log(
    `[accounts-store] setActive id=${id} name=${acc.profile.name} pageId=${
      acc.pageId ? acc.pageId.slice(0, 16) + '…' : '(default)'
    } fp=${cookieFingerprint(acc.cookie)}`
  )
  return acc
}

export function removeAccount(id: string): AccountsFile {
  const file = loadAccountsFile()
  file.accounts = file.accounts.filter((a) => a.id !== id)
  if (file.activeId === id) {
    file.activeId = file.accounts[0]?.id ?? null
  }
  saveAccountsFile(file)
  if (file.activeId) {
    const next = file.accounts.find((a) => a.id === file.activeId)
    if (next) saveCookieString(next.cookie)
  } else {
    clearSession()
  }
  return file
}

/**
 * Remove todos os slots com o mesmo cookie Google (todos os Brand da mesma sessão).
 * Usado no logout — evita pageId/cookie mortos reaparecendo no menu.
 */
export function removeAccountsByCookieFingerprint(fp: string): AccountsFile {
  const file = loadAccountsFile()
  const before = file.accounts.length
  const removedActive = file.accounts.some(
    (a) => a.id === file.activeId && cookieFingerprint(a.cookie) === fp
  )
  file.accounts = file.accounts.filter((a) => cookieFingerprint(a.cookie) !== fp)
  if (removedActive || !file.accounts.some((a) => a.id === file.activeId)) {
    file.activeId = file.accounts[0]?.id ?? null
  }
  saveAccountsFile(file)
  if (file.activeId) {
    const next = file.accounts.find((a) => a.id === file.activeId)
    if (next) saveCookieString(next.cookie)
  } else {
    clearSession()
  }
  console.log(
    `[accounts-store] logout fp=${fp} removed=${before - file.accounts.length} left=${file.accounts.length}`
  )
  return file
}

/** Importa session.enc antiga se accounts.enc vazio */
export function migrateLegacySessionIfNeeded(): void {
  const file = loadAccountsFile()
  if (file.accounts.length > 0) return
  const cookie = loadCookieString()
  if (!cookie) return
  addAccountEntry({ name: 'Conta salva' }, cookie)
}
