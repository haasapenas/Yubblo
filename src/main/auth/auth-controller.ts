import { ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '../../shared/contracts/ipc'
import type { AuthState, UserProfile } from '../../shared/contracts/auth'
import {
  authStateFromProfile, bootstrapCookie, clearAuthPartition, cookieDebugSummary,
  emptyAuthState, logoutAuth, normalizeYoutubeCookieString, openLoginWindow,
  restoreCookiesToPartition
} from '../auth'
import { saveCookieString } from '../session-store'
import {
  addAccountEntry, cookieFingerprint, getAccountById, listAccounts,
  migrateLegacySessionIfNeeded, removeAccount, removeAccountsByCookieFingerprint,
  setActiveAccount, updateAccount, upsertActiveAccount, upsertIdentityAccount,
  getActiveAccount
} from '../accounts-store'
import { chatService } from '../chat/chat-service'

let mainWindow: BrowserWindow | null = null
let authState: AuthState = emptyAuthState()
let cookie: string | null = null

function accountsMeta(): Pick<AuthState, 'accounts' | 'activeAccountId'> {
  const accounts = listAccounts()
  const active = accounts.find((a) => a.active)
  return {
    accounts,
    activeAccountId: active?.id ?? getActiveAccount()?.id ?? null
  }
}

function buildAuthState(profile: UserProfile | null, cookieStr: string | null): AuthState {
  return authStateFromProfile(profile, cookieStr, accountsMeta())
}

function sendAuth(): void {
  // Sempre anexa lista de contas atualizada
  authState = {
    ...authState,
    ...accountsMeta()
  }
  mainWindow?.webContents.send(IPC.auth.changed, authState)
}

type ApplySessionOpts = {
  restoreChannels?: boolean
  /** Atualiza este slot (switch / restore) */
  accountId?: string
  /** Brand pageId salvo no slot */
  pageId?: string
  identityId?: string
  /** Adicionar conta: sempre cria slot novo */
  asNewAccount?: boolean
}

async function applyCookieSession(
  rawCookie: string,
  opts?: ApplySessionOpts
): Promise<AuthState> {
  cookie = normalizeYoutubeCookieString(rawCookie)
  saveCookieString(cookie)
  await restoreCookiesToPartition(cookie)
  chatService.stopChat()

  let pageId = opts?.pageId
  const identityId = opts?.identityId
  console.log(
    `[auth] applySession fp=${cookieFingerprint(cookie)} pageId=${
      pageId ? pageId.slice(0, 16) + '…' : '(default)'
    } accountId=${opts?.accountId || '∅'} new=${!!opts?.asNewAccount}`
  )

  let profile = await chatService.initWithCookie(cookie, {
    onBehalfOfUser: pageId,
    identityId
  })

  // Slot com Brand pageId morto (ex.: deslogou e o pageId ficou salvo) → 401 no chat.
  // Valida auth de verdade; se falhar, cai no canal default da mesma conta Google.
  if (pageId) {
    const authCheck = await chatService.validateSessionAuth()
    if (!authCheck.ok) {
      console.warn(
        `[auth] pageId do slot inválido (${authCheck.reason}); reabrindo sem Brand`
      )
      pageId = undefined
      profile = await chatService.initWithCookie(cookie, { identityId: undefined })
    }
  }

  // Se pedimos Brand e o profile veio genérico/errado, usa o salvo no slot
  // (só se a sessão ainda tiver o pageId — senão o nome do Brand morto engana a UI)
  let finalProfile = profile
  if (opts?.accountId) {
    const stored = getAccountById(opts.accountId)
    if (stored && pageId) {
      const remoteBad =
        !profile ||
        profile.name === 'Logado no YouTube' ||
        (opts.pageId &&
          stored.profile.name &&
          profile.name !== stored.profile.name &&
          profile.handle !== stored.profile.handle)
      if (remoteBad) {
        finalProfile = stored.profile
        console.log(
          '[auth] usando perfil salvo do slot',
          stored.profile.name,
          stored.profile.handle
        )
      }
    }
    updateAccount(opts.accountId, {
      profile: finalProfile || stored?.profile || { name: 'Conta YouTube' },
      cookie,
      // Se o Brand morreu, grava null para não reaplicar pageId podre no próximo boot
      pageId: pageId ?? chatService.getOnBehalfOfUser() ?? null,
      identityId: pageId
        ? identityId ?? chatService.getActiveIdentityId() ?? null
        : null,
      setActive: true
    })
  } else if (opts?.asNewAccount && finalProfile) {
    addAccountEntry(finalProfile, cookie, {
      pageId: chatService.getOnBehalfOfUser() || null,
      identityId: chatService.getActiveIdentityId() || null
    })
  } else if (finalProfile) {
    upsertActiveAccount(finalProfile, cookie, {
      pageId: chatService.getOnBehalfOfUser() || null,
      identityId: chatService.getActiveIdentityId() || null
    })
  }

  authState = buildAuthState(finalProfile, cookie)
  sendAuth()
  if (opts?.restoreChannels !== false) {
    // await: UI já recebe abas ao terminar o login (void deixava vazio se falhasse em silêncio)
    try {
      await chatService.restoreSavedChannels()
    } catch (e) {
      console.warn('[auth] restoreSavedChannels', e)
    }
  }
  return authState
}

async function applyGuestSession(): Promise<AuthState> {
  chatService.stopChat()
  cookie = null
  await chatService.initGuest()
  authState = { ...emptyAuthState(), ...accountsMeta() }
  sendAuth()
  try {
    await chatService.restoreSavedChannels()
  } catch (error) {
    console.warn('[auth] guest restoreSavedChannels', error)
  }
  return authState
}


export function setAuthWindow(window: BrowserWindow | null): void {
  mainWindow = window
}

export function isAuthenticated(): boolean {
  return !!cookie && authState.loggedIn
}

export function registerAuthIpc(): void {
  ipcMain.handle(IPC.auth.getState, () => {
    authState = { ...authState, ...accountsMeta() }
    return authState
  })

  ipcMain.handle(IPC.auth.login, async () => {
    if (!mainWindow) return authState
    try {
      const raw = await openLoginWindow(mainWindow)
      console.log('[auth:login]', cookieDebugSummary(raw))
      return await applyCookieSession(raw)
    } catch (e) {
      const err = e as Error
      if (err.message !== 'Login cancelado') {
        console.error('[auth:login]', err)
      }
      return authState
    }
  })

  ipcMain.handle(IPC.auth.addAccount, async () => {
    if (!mainWindow) return authState
    const previous = getActiveAccount()
    try {
      // Partition limpo = cookies da conta nova não misturam com a anterior
      await clearAuthPartition()
      const raw = await openLoginWindow(mainWindow, { accountChooser: true })
      console.log('[auth:addAccount]', cookieDebugSummary(raw))
      return await applyCookieSession(raw, { asNewAccount: true })
    } catch (e) {
      const err = e as Error
      if (err.message !== 'Login cancelado') {
        console.error('[auth:addAccount]', err)
      }
      // Restaura conta anterior se o usuário cancelou
      if (previous?.cookie) {
        try {
          return await applyCookieSession(previous.cookie, {
            accountId: previous.id,
            pageId: previous.pageId,
            identityId: previous.identityId
          })
        } catch {
          /* ignore */
        }
      }
      return { ...authState, ...accountsMeta() }
    }
  })

  ipcMain.handle(IPC.auth.switchChannel, async () => {
    // Legado: abre seletor do site (instável). Preferir list + switchChannelIdentity.
    if (!mainWindow) return authState
    if (!cookie || !authState.loggedIn) {
      throw new Error(
        JSON.stringify({
          code: 'NOT_LOGGED_IN',
          message: 'Login required',
          messageKey: 'errors.loginRequired'
        })
      )
    }
    try {
      const raw = await openLoginWindow(mainWindow, { channelSwitcher: true })
      console.log('[auth:switchChannel]', cookieDebugSummary(raw))
      return await applyCookieSession(raw)
    } catch (e) {
      const err = e as Error
      if (err.message !== 'Login cancelado') {
        console.error('[auth:switchChannel]', err)
      }
      return { ...authState, ...accountsMeta() }
    }
  })

  ipcMain.handle(IPC.auth.listChannelIdentities, async () => {
    if (!cookie || !authState.loggedIn) {
      throw new Error(
        JSON.stringify({
          code: 'NOT_LOGGED_IN',
          message: 'Login required',
          messageKey: 'errors.loginRequired'
        })
      )
    }
    try {
      return await chatService.listChannelIdentities()
    } catch (e) {
      const appErr = e as { code?: string; message?: string; messageKey?: string; params?: Record<string, string | number> }
      throw new Error(
        JSON.stringify({
          code: appErr.code || 'UNKNOWN',
          message: appErr.message || 'Could not list channels',
          messageKey: appErr.messageKey || 'auth:errors.noChannels',
          params: appErr.params
        })
      )
    }
  })

  ipcMain.handle(IPC.auth.switchChannelIdentity, async (_e, identityId: string) => {
    if (!cookie || !authState.loggedIn) {
      throw new Error(
        JSON.stringify({
          code: 'NOT_LOGGED_IN',
          message: 'Login required',
          messageKey: 'errors.loginRequired'
        })
      )
    }
    try {
      // 1) Congela o canal ATUAL num slot (com pageId atual) para poder voltar
      const prev = getActiveAccount()
      if (prev && cookie && authState.profile) {
        upsertIdentityAccount(authState.profile, cookie, {
          pageId: chatService.getOnBehalfOfUser() || null,
          identityId: chatService.getActiveIdentityId() || null
        })
      }

      // 2) Troca no Innertube
      const profile = await chatService.switchChannelIdentity(identityId)
      if (profile && cookie) {
        // 3) Slot próprio para o canal de destino (mesmo cookie + pageId Brand)
        upsertIdentityAccount(profile, cookie, {
          pageId: chatService.getOnBehalfOfUser() || null,
          identityId: chatService.getActiveIdentityId() || identityId || null
        })
      }
      authState = buildAuthState(profile, cookie)
      sendAuth()
      console.log(
        '[auth:switchChannelIdentity]',
        profile?.name,
        profile?.handle,
        'pageId=',
        chatService.getOnBehalfOfUser()?.slice(0, 16) || '(default)',
        'slots=',
        listAccounts().length
      )
      return authState
    } catch (e) {
      const appErr = e as { code?: string; message?: string; messageKey?: string; params?: Record<string, string | number> }
      throw new Error(
        JSON.stringify({
          code: appErr.code || 'UNKNOWN',
          message: appErr.message || 'Could not switch channel',
          messageKey: appErr.messageKey || 'auth:errors.switchAccountFailed',
          params: appErr.params
        })
      )
    }
  })

  ipcMain.handle(IPC.auth.switchAccount, async (_e, accountId: string) => {
    const acc = setActiveAccount(accountId)
    if (!acc) {
      throw new Error(
        JSON.stringify({
          code: 'UNKNOWN',
          message: 'Account not found.',
          messageKey: 'auth:errors.switchAccountFailed'
        })
      )
    }
    try {
      console.log(
        '[auth:switchAccount]',
        acc.profile.name,
        acc.id,
        'pageId=',
        acc.pageId?.slice(0, 16) || '(default)',
        'fp=',
        cookieFingerprint(acc.cookie)
      )
      // Restaura cookie + Brand pageId do slot (essencial para voltar ao canal certo)
      return await applyCookieSession(acc.cookie, {
        accountId: acc.id,
        pageId: acc.pageId,
        identityId: acc.identityId
      })
    } catch (e) {
      console.error('[auth:switchAccount]', e)
      throw e
    }
  })

  ipcMain.handle(IPC.auth.removeAccount, async (_e, accountId: string) => {
    const wasActive = authState.activeAccountId === accountId || getActiveAccount()?.id === accountId
    removeAccount(accountId)
    if (wasActive) {
      const next = getActiveAccount()
      if (next) {
        return await applyCookieSession(next.cookie)
      }
      chatService.stopChat()
      await chatService.clear()
      await logoutAuth()
      return await applyGuestSession()
    }
    authState = { ...authState, ...accountsMeta() }
    sendAuth()
    return authState
  })

  ipcMain.handle(IPC.auth.listAccounts, async () => listAccounts())

  ipcMain.handle(IPC.auth.logout, async () => {
    chatService.stopChat()
    await chatService.clear()
    // Logout = encerra a sessão Google. Todos os slots Brand com o MESMO cookie
    // saem juntos (evita “trocar para haasapnas” com pageId/cookie mortos).
    const active = getActiveAccount()
    if (active) {
      removeAccountsByCookieFingerprint(cookieFingerprint(active.cookie))
    }
    const next = getActiveAccount()
    if (next) {
      return await applyCookieSession(next.cookie, {
        accountId: next.id,
        pageId: next.pageId,
        identityId: next.identityId
      })
    }
    await logoutAuth()
    return await applyGuestSession()
  })

}
export async function restoreAuthSession(): Promise<void> {
  try {
    migrateLegacySessionIfNeeded()
    const active = getActiveAccount()
    if (active?.cookie) {
      await applyCookieSession(active.cookie, {
        accountId: active.id,
        pageId: active.pageId,
        identityId: active.identityId
      })
      return
    }
    cookie = await bootstrapCookie()
    if (cookie) {
      await applyCookieSession(cookie)
    } else {
      await applyGuestSession()
    }
  } catch (e) {
    console.warn('[bootstrap]', e)
    cookie = null
    try {
      await applyGuestSession()
    } catch (guestError) {
      console.warn('[bootstrap:guest]', guestError)
      authState = { ...emptyAuthState(), ...accountsMeta() }
      sendAuth()
    }
  }
}
