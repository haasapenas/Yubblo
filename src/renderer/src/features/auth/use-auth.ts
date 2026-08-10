import { useEffect, useState } from 'react'
import type {
  AppError,
  AuthState,
  YtChannelIdentity
} from '../../../../shared/types'
import { parseIpcError } from '../../shared/format'

export interface UseAuthResult {
  auth: AuthState
  busy: boolean
  identities: YtChannelIdentity[]
  identityPickerOpen: boolean
  identityPickerLoading: boolean
  login(): Promise<void>
  addAccount(): Promise<void>
  switchAccount(accountId: string): Promise<void>
  removeAccount(accountId: string): Promise<void>
  openIdentityPicker(): Promise<void>
  closeIdentityPicker(): void
  chooseIdentity(identityId: string): Promise<void>
  logout(): Promise<void>
}

export function shouldResetAfterAccountRemoval(
  removedAccountId: string,
  previousActiveAccountId: string | null | undefined,
  remainsLoggedIn: boolean
): boolean {
  return !remainsLoggedIn || removedAccountId === previousActiveAccountId
}

export async function runAuthContextTransition<T>(
  reset: () => void,
  operation: () => Promise<T>
): Promise<T> {
  reset()
  return operation()
}

export function useAuth(
  apiReady: boolean,
  onResetChatUi: () => void,
  onError: (error: AppError | null) => void
): UseAuthResult {
  const [auth, setAuth] = useState<AuthState>({ loggedIn: false, profile: null })
  const [busy, setBusy] = useState(false)
  const [identities, setIdentities] = useState<YtChannelIdentity[]>([])
  const [identityPickerOpen, setIdentityPickerOpen] = useState(false)
  const [identityPickerLoading, setIdentityPickerLoading] = useState(false)

  useEffect(() => {
    if (!apiReady || !window.yubblo) return
    void window.yubblo.auth.getState()
      .then(setAuth)
      .catch((error) => onError(parseIpcError(error)))
    return window.yubblo.auth.onChanged(setAuth)
  }, [apiReady, onError])

  async function login(): Promise<void> {
    if (!window.yubblo) return
    setBusy(true)
    onError(null)
    try {
      const state = await window.yubblo.auth.login()
      setAuth(state)
      if (!state.loggedIn) {
        onError({ code: 'AUTH_FAILED', message: '', messageKey: 'auth:errors.loginIncomplete' })
      }
    } catch (error) {
      onError({
        code: 'AUTH_FAILED',
        message: '', messageKey: 'auth:errors.loginFailed'
      })
    } finally {
      setBusy(false)
    }
  }

  async function addAccount(): Promise<void> {
    if (!window.yubblo) return
    setBusy(true)
    onError(null)
    try {
      const state = await window.yubblo.auth.addAccount()
      setAuth(state)
      onResetChatUi()
      if (!state.loggedIn) {
        onError({ code: 'AUTH_FAILED', message: '', messageKey: 'auth:errors.accountNotAdded' })
      }
    } catch (error) {
      onError({
        code: 'AUTH_FAILED',
        message: '', messageKey: 'auth:errors.addAccountFailed'
      })
    } finally {
      setBusy(false)
    }
  }

  async function switchAccount(accountId: string): Promise<void> {
    if (!window.yubblo || accountId === auth.activeAccountId) return
    setBusy(true)
    onError(null)
    try {
      const state = await runAuthContextTransition(
        onResetChatUi,
        () => window.yubblo!.auth.switchAccount(accountId)
      )
      setAuth(state)
    } catch (error) {
      onError({
        code: 'AUTH_FAILED',
        message: '', messageKey: 'auth:errors.switchAccountFailed'
      })
    } finally {
      setBusy(false)
    }
  }

  async function removeAccount(accountId: string): Promise<void> {
    if (!window.yubblo) return
    const previousActive = auth.activeAccountId
    setBusy(true)
    try {
      const state = await window.yubblo.auth.removeAccount(accountId)
      setAuth(state)
      if (shouldResetAfterAccountRemoval(accountId, previousActive, state.loggedIn)) {
        onResetChatUi()
      }
    } catch (error) {
      onError({
        code: 'AUTH_FAILED',
        message: '', messageKey: 'auth:errors.removeAccountFailed'
      })
    } finally {
      setBusy(false)
    }
  }

  async function openIdentityPicker(): Promise<void> {
    if (!window.yubblo) return
    setIdentityPickerOpen(true)
    setIdentityPickerLoading(true)
    onError(null)
    try {
      const list = await window.yubblo.auth.listChannelIdentities()
      setIdentities(list)
      if (list.length === 0) {
        onError({
          code: 'UNKNOWN',
          message: '', messageKey: 'auth:errors.noChannels'
        })
      }
    } catch (error) {
      onError(parseIpcError(error))
      setIdentityPickerOpen(false)
    } finally {
      setIdentityPickerLoading(false)
    }
  }

  async function chooseIdentity(identityId: string): Promise<void> {
    if (!window.yubblo) return
    if (identities.find((identity) => identity.id === identityId)?.isSelected) {
      setIdentityPickerOpen(false)
      return
    }
    setBusy(true)
    onError(null)
    try {
      const state = await runAuthContextTransition(
        onResetChatUi,
        () => window.yubblo!.auth.switchChannelIdentity(identityId)
      )
      setAuth(state)
      try {
        setIdentities(await window.yubblo.auth.listChannelIdentities())
      } catch {
        setIdentities((previous) => previous.map((identity) => ({
          ...identity,
          isSelected: identity.id === identityId
        })))
      }
      setIdentityPickerOpen(false)
    } catch (error) {
      onError(parseIpcError(error))
      try {
        setIdentities(await window.yubblo.auth.listChannelIdentities())
      } catch {
        // Mantém a lista anterior.
      }
    } finally {
      setBusy(false)
    }
  }

  async function logout(): Promise<void> {
    if (!window.yubblo) return
    setBusy(true)
    try {
      const state = await window.yubblo.auth.logout()
      setAuth(state)
      onResetChatUi()
      if (!state.loggedIn) onError(null)
    } finally {
      setBusy(false)
    }
  }

  return {
    auth,
    busy,
    identities,
    identityPickerOpen,
    identityPickerLoading,
    login,
    addAccount,
    switchAccount,
    removeAccount,
    openIdentityPicker,
    closeIdentityPicker: () => setIdentityPickerOpen(false),
    chooseIdentity,
    logout
  }
}
