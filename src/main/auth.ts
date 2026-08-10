import { BrowserWindow, Menu, session } from 'electron'
import type { AuthState, UserProfile } from '../shared/types'
import { clearSession, loadCookieString, saveCookieString } from './session-store'
import { getMainLocale, translateMain } from './i18n/i18n-main'
import { getYoutubeLocale } from '../shared/i18n/youtube-locale'
import { BRAND } from '../shared/brand'

function loginUrl(chooser: boolean): string {
  const path = chooser ? 'AccountChooser' : 'ServiceLogin'
  const passive = chooser ? '' : '&uilel=3&passive=true'
  const locale = getYoutubeLocale(getMainLocale())
  return `https://accounts.google.com/${path}?service=youtube${passive}&continue=https%3A%2F%2Fwww.youtube.com%2F&hl=${locale.loginHl}`
}

/** Força o seletor de contas Google (várias contas no mesmo Chrome) */

/** Troca de canal Brand / multi-canal na mesma conta Google */
const CHANNEL_SWITCHER_URL = 'https://www.youtube.com/channel_switcher'

export const AUTH_PARTITION = BRAND.authPartition

/**
 * youtubei.js só gera SAPISIDHASH a partir do cookie literal "SAPISID".
 * O Chrome moderno frequentemente só tem __Secure-1PAPISID / __Secure-3PAPISID
 * (mesmo valor). Sem SAPISID → Authorization ausente → send_message 401.
 */
export function normalizeYoutubeCookieString(raw: string): string {
  const map = new Map<string, string>()

  for (const part of raw.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const name = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!name || !value) continue
    map.set(name, value)
  }

  const securePapisid =
    map.get('SAPISID') ||
    map.get('__Secure-3PAPISID') ||
    map.get('__Secure-1PAPISID') ||
    map.get('APISID')

  if (securePapisid && !map.has('SAPISID')) {
    map.set('SAPISID', securePapisid)
  }

  // Garante APISID também (alguns fluxos olham)
  if (securePapisid && !map.has('APISID')) {
    const apisid = map.get('__Secure-3PAPISID') || map.get('__Secure-1PAPISID') || securePapisid
    if (!map.has('APISID')) map.set('APISID', apisid)
  }

  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

export function cookieHasSendAuth(cookie: string): boolean {
  const n = normalizeYoutubeCookieString(cookie)
  return (
    /(?:^|;\s*)SAPISID=/.test(n) ||
    /(?:^|;\s*)__Secure-3PAPISID=/.test(n) ||
    /(?:^|;\s*)__Secure-1PAPISID=/.test(n)
  )
}

export function cookieDebugSummary(cookie: string | null): string {
  if (!cookie) return '(sem cookie)'
  const names = cookie
    .split(';')
    .map((p) => p.trim().split('=')[0])
    .filter(Boolean)
  const important = [
    'SAPISID',
    '__Secure-1PAPISID',
    '__Secure-3PAPISID',
    'SID',
    '__Secure-1PSID',
    '__Secure-3PSID',
    'LOGIN_INFO',
    'HSID',
    'SSID',
    'APISID'
  ]
  const present = important.filter((n) => names.includes(n))
  const missing = important.filter((n) => !names.includes(n))
  return `present=[${present.join(', ')}] missing=[${missing.join(', ')}] total=${names.length}`
}

export async function collectYoutubeCookieString(): Promise<string | null> {
  const ses = session.fromPartition(AUTH_PARTITION)

  // Coleta por URL (inclui cookies Secure do YouTube) + domínio
  const [byYt, byGoogle, all] = await Promise.all([
    ses.cookies.get({ url: 'https://www.youtube.com' }),
    ses.cookies.get({ url: 'https://www.google.com' }),
    ses.cookies.get({})
  ])

  const byName = new Map<string, string>()
  for (const c of [...all, ...byGoogle, ...byYt]) {
    const d = c.domain || ''
    if (!d.includes('youtube.com') && !d.includes('google.com')) continue
    // Preferir valor mais recente / de youtube
    byName.set(c.name, c.value)
  }

  if (byName.size === 0) return null

  const names = new Set(byName.keys())
  const hasPapisid =
    names.has('SAPISID') || names.has('__Secure-1PAPISID') || names.has('__Secure-3PAPISID')
  const hasSid =
    names.has('SID') ||
    names.has('__Secure-1PSID') ||
    names.has('__Secure-3PSID') ||
    names.has('LOGIN_INFO')

  if (!hasPapisid || !hasSid) return null

  const raw = [...byName.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  return normalizeYoutubeCookieString(raw)
}

export async function restoreCookiesToPartition(cookieString: string): Promise<void> {
  const ses = session.fromPartition(AUTH_PARTITION)
  await ses.clearStorageData({ storages: ['cookies'] })

  const normalized = normalizeYoutubeCookieString(cookieString)
  const parts = normalized.split(';').map((p) => p.trim()).filter(Boolean)

  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (!name || !value) continue

    const isHost = name.startsWith('__Host-')
    const isGoogleOnly =
      name === 'SID' ||
      name === 'HSID' ||
      name === 'SSID' ||
      name === 'APISID' ||
      name === 'SAPISID' ||
      name.startsWith('__Secure-1') ||
      name.startsWith('__Secure-3') ||
      name.includes('GOOGLE')

    // Grava em youtube e google quando fizer sentido (sessão compartilhada)
    const targets: Array<{ url: string; domain?: string }> = [
      { url: 'https://www.youtube.com', domain: isHost ? undefined : '.youtube.com' }
    ]
    if (isGoogleOnly || name === 'SAPISID' || name === 'APISID') {
      targets.push({ url: 'https://www.google.com', domain: isHost ? undefined : '.google.com' })
    }

    for (const t of targets) {
      try {
        await ses.cookies.set({
          url: t.url,
          name,
          value,
          domain: t.domain,
          path: '/',
          secure: true,
          httpOnly: false,
          sameSite: 'no_restriction' as const,
          expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180
        })
      } catch {
        try {
          await ses.cookies.set({
            url: t.url,
            name,
            value,
            path: '/',
            secure: true,
            expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 180
          })
        } catch {
          /* cookie individual rejeitado */
        }
      }
    }
  }

  await ses.cookies.flushStore()
}

export type AuthWindowOpts = {
  /** Abre seletor de contas Google (adicionar outra conta) */
  accountChooser?: boolean
  /** Troca de canal YouTube (mesma conta Google, outro canal Brand) */
  channelSwitcher?: boolean
  title?: string
}

/**
 * Janela de login / troca de conta ou canal.
 *
 * - Login normal: detecta cookies sozinho e fecha.
 * - Trocar canal / adicionar conta: NÃO fecha sozinho (cookies já existem).
 *   O usuário escolhe no YouTube e clica em "Usar este canal/conta" no menu.
 */
export function openLoginWindow(
  parent: BrowserWindow,
  opts?: AuthWindowOpts
): Promise<string> {
  return new Promise((resolve, reject) => {
    const isSwitcher = !!opts?.channelSwitcher
    const isChooser = !!opts?.accountChooser
    /** Precisa de clique manual — senão fecha na hora com a sessão atual */
    const needsManualConfirm = isSwitcher || isChooser

    const loginWin = new BrowserWindow({
      width: 640,
      height: 820,
      parent,
      modal: true,
      title:
        opts?.title ||
        (isSwitcher
          ? translateMain('auth.switchChannelTitle')
          : isChooser
            ? translateMain('auth.addAccountTitle')
            : translateMain('auth.loginTitle')),
      // menu visível no modo manual (botão de confirmar)
      autoHideMenuBar: !needsManualConfirm,
      webPreferences: {
        partition: AUTH_PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    })

    let settled = false
    let lastCheck = 0
    const startUrl = isSwitcher
      ? CHANNEL_SWITCHER_URL
      : isChooser
        ? loginUrl(true)
        : loginUrl(false)

    const finish = async (force = false): Promise<boolean> => {
      if (settled) return true
      const now = Date.now()
      if (!force && now - lastCheck < 800) return false
      lastCheck = now

      const cookie = await collectYoutubeCookieString()
      if (!cookie) return false

      // Exige cookies fortes o bastante para send_message
      if (!cookieHasSendAuth(cookie)) return false

      settled = true
      const normalized = normalizeYoutubeCookieString(cookie)
      saveCookieString(normalized)
      console.log('[auth] login OK', cookieDebugSummary(normalized))
      if (!loginWin.isDestroyed()) loginWin.close()
      resolve(normalized)
      return true
    }

    /** Confirmação manual (troca de canal / conta) */
    const finishManual = async (): Promise<void> => {
      // tempo extra para o YouTube gravar cookies do canal escolhido
      await new Promise((r) => setTimeout(r, 600))
      const ok = await finish(true)
      if (!ok && !loginWin.isDestroyed()) {
        // tenta de novo após mais um instante
        await new Promise((r) => setTimeout(r, 1200))
        const ok2 = await finish(true)
        if (!ok2) {
          console.warn('[auth] confirmar: cookies ainda incompletos')
        }
      }
    }

    if (needsManualConfirm) {
      const confirmLabel = isSwitcher
        ? translateMain('auth.useChannel')
        : translateMain('auth.useAccount')
      const menu = Menu.buildFromTemplate([
        {
          label: confirmLabel,
          accelerator: 'CmdOrCtrl+Enter',
          click: () => {
            void finishManual()
          }
        },
        {
          label: translateMain('auth.cancel'),
          accelerator: 'Escape',
          click: () => {
            if (!loginWin.isDestroyed()) loginWin.close()
          }
        }
      ])
      loginWin.setMenu(menu)
      // Dica no título
      loginWin.setTitle(translateMain('auth.manualTitle', {
        title: opts?.title || (isSwitcher
          ? translateMain('auth.switchChannelTitle')
          : translateMain('auth.addAccountTitle')),
        action: confirmLabel
      }))
    }

    const onMaybeLoggedIn = (url: string): void => {
      // No modo manual: nunca fecha sozinho
      if (needsManualConfirm) return
      if (!url.includes('youtube.com')) return
      if (url.includes('accounts.google') || url.includes('ServiceLogin')) return
      if (url.includes('AccountChooser') || url.includes('channel_switcher')) return
      // Login normal: Dá tempo do Chrome gravar cookies Secure após o redirect
      setTimeout(() => {
        void finish(true)
      }, 1200)
      setTimeout(() => {
        void finish(true)
      }, 3000)
    }

    const injectConfirmBar = async (): Promise<void> => {
      if (!needsManualConfirm || loginWin.isDestroyed()) return
      const label = isSwitcher
        ? translateMain('auth.useChannelInApp')
        : translateMain('auth.useAccountInApp')
      const hint = isSwitcher
        ? translateMain('auth.channelHint')
        : translateMain('auth.accountHint')
      const confirming = translateMain('auth.confirming')
      const payload = JSON.stringify({ label, hint, confirming })
      try {
        await loginWin.webContents.executeJavaScript(`
          (function () {
            var cfg = ${payload};
            if (document.getElementById('yubblo-confirm-bar')) return;
            var bar = document.createElement('div');
            bar.id = 'yubblo-confirm-bar';
            bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;background:#0f0f12;color:#f2f2f5;font:600 13px Segoe UI,system-ui,sans-serif;border-bottom:1px solid #2e2e3a;box-shadow:0 8px 24px rgba(0,0,0,.45)';
            var text = document.createElement('div');
            text.innerHTML = '<div style="font-size:13px;font-weight:700">Yubblo</div><div style="font-size:11px;color:#9a9aad;font-weight:500;margin-top:2px">' + cfg.hint + '</div>';
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = cfg.label;
            btn.style.cssText = 'flex-shrink:0;border:none;border-radius:8px;cursor:pointer;padding:10px 14px;background:#3dd68c;color:#0f0f12;font:700 13px Segoe UI,system-ui,sans-serif';
            btn.onclick = function () {
              btn.disabled = true;
              btn.textContent = cfg.confirming;
              document.title = 'YUBBLO_CONFIRM_AUTH';
            };
            bar.appendChild(text);
            bar.appendChild(btn);
            (document.body || document.documentElement).appendChild(bar);
          })();
        `)
      } catch {
        /* página especial / about:blank */
      }
    }

    // Detecta clique no botão injetado (muda title)
    loginWin.webContents.on('page-title-updated', (_e, title) => {
      if (title === 'YUBBLO_CONFIRM_AUTH') {
        void finishManual()
      }
    })

    loginWin.webContents.on('did-navigate', (_e, url) => onMaybeLoggedIn(url))
    loginWin.webContents.on('did-navigate-in-page', (_e, url) => onMaybeLoggedIn(url))
    loginWin.webContents.on('did-finish-load', () => {
      const url = loginWin.webContents.getURL()
      onMaybeLoggedIn(url)
      void injectConfirmBar()
    })
    loginWin.webContents.on('did-navigate-in-page', () => {
      void injectConfirmBar()
    })

    // Polling só no login normal (já tem cookie válido no switcher)
    let timer: ReturnType<typeof setInterval> | null = null
    if (!needsManualConfirm) {
      timer = setInterval(() => {
        void finish(false)
      }, 1500)
    }

    loginWin.on('closed', () => {
      if (timer) clearInterval(timer)
      if (!settled) reject(new Error('Login cancelado'))
    })

    void loginWin.loadURL(startUrl)
  })
}

export async function logoutAuth(): Promise<void> {
  clearSession()
  const ses = session.fromPartition(AUTH_PARTITION)
  await ses.clearStorageData()
}

/** Limpa só o partition Electron (cookies), sem apagar accounts.enc */
export async function clearAuthPartition(): Promise<void> {
  const ses = session.fromPartition(AUTH_PARTITION)
  await ses.clearStorageData()
  console.log('[auth] partition limpo')
}

export async function bootstrapCookie(): Promise<string | null> {
  const saved = loadCookieString()
  if (saved) {
    const normalized = normalizeYoutubeCookieString(saved)
    await restoreCookiesToPartition(normalized)
    const fresh = await collectYoutubeCookieString()
    const result = fresh || normalized
    if (!cookieHasSendAuth(result)) {
      console.warn('[auth] cookie restaurado sem SAPISID/*PAPISID — será preciso logar de novo')
      return null
    }
    console.log('[auth] bootstrap', cookieDebugSummary(result))
    return normalizeYoutubeCookieString(result)
  }
  return null
}

export function emptyAuthState(): AuthState {
  return { loggedIn: false, profile: null, accounts: [], activeAccountId: null }
}

export function authStateFromProfile(
  profile: UserProfile | null,
  cookie: string | null,
  extra?: { accounts?: AuthState['accounts']; activeAccountId?: string | null }
): AuthState {
  if (!cookie || !profile) {
    return {
      ...emptyAuthState(),
      accounts: extra?.accounts || [],
      activeAccountId: extra?.activeAccountId ?? null
    }
  }
  return {
    loggedIn: true,
    profile,
    accounts: extra?.accounts,
    activeAccountId: extra?.activeAccountId
  }
}
