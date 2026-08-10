import { createInstance } from 'i18next'
import type { AppLocale } from '../../shared/i18n/locale'
import { DEFAULT_APP_LOCALE, normalizeAppLocale } from '../../shared/i18n/locale'

const mainI18n = createInstance()

void mainI18n.init({
  lng: DEFAULT_APP_LOCALE,
  fallbackLng: DEFAULT_APP_LOCALE,
  resources: {
    'en-US': {
      main: {
        auth: {
          loginTitle: 'Sign in to YouTube',
          switchChannelTitle: 'Switch YouTube channel',
          addAccountTitle: 'Add Google account',
          useChannel: '✓ Use this channel',
          useAccount: '✓ Use this account',
          cancel: 'Cancel',
          manualTitle: '{{title}} — choose and click “{{action}}” in the menu',
          useChannelInApp: 'Use this channel in Yubblo',
          useAccountInApp: 'Use this account in Yubblo',
          channelHint: 'Select the channel, then click the green button.',
          accountHint: 'Choose the Google account, then click the green button.',
          confirming: 'Confirming…'
        },
        channelActivity: {
          selfUnavailable: 'You cannot view your own channel activity. YouTube does not provide this history for the current account.'
        }
      }
    },
    'pt-BR': {
      main: {
        auth: {
          loginTitle: 'Entrar no YouTube',
          switchChannelTitle: 'Trocar canal do YouTube',
          addAccountTitle: 'Adicionar conta Google',
          useChannel: '✓ Usar este canal',
          useAccount: '✓ Usar esta conta',
          cancel: 'Cancelar',
          manualTitle: '{{title}} — escolha e clique em “{{action}}” no menu',
          useChannelInApp: 'Usar este canal no Yubblo',
          useAccountInApp: 'Usar esta conta no Yubblo',
          channelHint: 'Selecione o canal e clique no botão verde.',
          accountHint: 'Escolha a conta Google e clique no botão verde.',
          confirming: 'Confirmando…'
        },
        channelActivity: {
          selfUnavailable: 'Não é possível visualizar sua própria atividade. O YouTube não disponibiliza esse histórico para a conta atual.'
        }
      }
    }
  }
})

export async function changeMainLocale(locale: AppLocale): Promise<void> {
  await mainI18n.changeLanguage(normalizeAppLocale(locale))
}

export function getMainLocale(): AppLocale {
  return normalizeAppLocale(mainI18n.resolvedLanguage || mainI18n.language)
}

export function translateMain(
  key: string,
  values?: Record<string, string | number>
): string {
  return mainI18n.t(key, { ns: 'main', ...values })
}
