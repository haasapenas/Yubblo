export const resources = {
  'en-US': {
    common: {
      actions: { add: 'Add', close: 'Close', remove: 'Remove' },
      language: { english: 'English', portugueseBrazil: 'Português (Brasil)' },
      status: {
        enterChannel: 'Enter a channel to open chat',
        loginRequired: 'Sign in with your YouTube account to continue',
        connectingChannels: 'Connecting {{count}} channels...',
        connectingChat: 'Connecting to chat...',
        replay: 'Chat replay — {{title}} ({{channel}})',
        unlisted: 'Chat open (not listed / not marked live) — {{title}}',
        live: 'Live — {{title}} ({{channel}})',
        ended: 'Live stream ended or chat closed',
        offlineNamed: 'Channel offline - {{channel}}',
        offline: 'Channel offline',
        otherLives: 'Other live streams from this channel — click to switch',
        liveCount: '{{count}} live',
        focusMode: 'Focus',
        enableFocusMode: 'Enable Focus Mode',
        disableFocusMode: 'Disable Focus Mode'
      },
      errors: {
        unknown: 'Unknown error',
        loginRequired: 'Sign in with YouTube first.',
        chatOpenFailed: 'Could not open the chat.',
        chatListFailed: 'Could not list live streams.',
        sendFailed: 'Could not send the message.',
        clearActiveOnly: 'Only the active tab can be cleared.',
        pollVoteFailed: 'Could not vote in the poll.',
        moderationMenuFailed: 'Could not open the moderation menu.',
        moderationActionFailed: 'Could not apply the moderation action.',
        unhideFailed: 'Could not unban the user.',
        chatUnavailable: 'This chat is no longer available.',
        channelNotFound: 'The channel could not be found.',
        notLive: 'No active live stream was found for this channel.',
        network: 'A network error occurred.',
        authFailed: 'YouTube authentication failed.',
        noModerationEndpoint: 'The moderation action is no longer available.',
        renderer: {
          rootMissing: 'Application root was not found.',
          renderFailed: 'Failed to render the application.',
          preloadMissing: 'The Electron bridge is unavailable. Close and reopen the app.'
        }
      }
    },
    settings: {
      title: 'Settings',
      description: 'Highlights, action buttons, and application preferences.',
      tabs: { language: 'Language', highlights: 'Highlights', actions: 'Action buttons' },
      nav: {
        general: 'General',
        highlights: 'Highlights',
        monitoring: 'Monitored users',
        actions: 'Action buttons'
      },
      groups: { application: 'Application', moderation: 'Moderation' },
      monitoring: {
        title: 'Monitored users',
        help: 'Users added here or from the message menu are highlighted in every channel.',
        namePlaceholder: 'Username',
        add: 'Add',
        color: 'Monitoring color',
        colorHelp: 'This color has priority over every other message highlight.',
        empty: 'No monitored users.',
        userColor: 'Color for {{user}}',
        useDefaultColor: 'Use default color for {{user}}',
        remove: 'Stop monitoring {{user}}'
      },
      bulkColors: {
        change: 'Change color ({{count}})',
        clear: 'Clear selection',
        selectAllHighlights: 'Select all highlights',
        selectAllMonitored: 'Select all monitored users',
        selectRule: 'Select {{rule}}',
        selectUser: 'Select {{user}}'
      },
      language: {
        title: 'Application language',
        help: 'Changes are applied immediately to the interface and YouTube sessions.'
      },
      update: {
        title: 'Updates', currentVersion: 'Current version: {{version}}',
        check: 'Check for updates', checking: 'Checking...', error: 'Could not check for updates.',
        status: { idle: 'Ready to check', checking: 'Checking for updates', available: 'Version {{version}} is available', downloading: 'Downloading update', downloaded: 'Ready to install', 'up-to-date': 'Yubblo is up to date', error: 'Check failed', unsupported: 'Available in the installed Windows version' }
      },
      chat: {
        title: 'Chat',
        fontSize: 'Chat font size',
        fontSizeHelp: 'Changes the text size of messages and chat notices.',
        pauseOnHover: 'Pause chat scrolling while hovering',
        pauseOnHoverHelp:
          'New messages keep arriving. Scrolling resumes at the latest message when the pointer leaves the chat.',
        showFocusModeShortcut: 'Show Focus Mode shortcut',
        showFocusModeShortcutHelp:
          'Adds a global Focus button to the chat status line. Focus Mode starts off whenever Yubblo opens.'
      },
      highlightsHelp:
        'Order = priority. The first matching rule sets the row color in every tab.',
      highlightPlaceholder: 'Keyword or phrase…',
      wholeWord: 'word',
      addRule: 'Add rule',
      noHighlights: 'No highlight rules yet.',
      highlightRules: {
        messages: 'Messages',
        help: 'Rules are evaluated from top to bottom. The first match controls color and sound.',
        filterPlaceholder: 'Filter rules…',
        add: 'Add rule',
        newPattern: 'New highlight',
        transfer: { import: 'Import', export: 'Export', imported: 'Imported {{count}} rules', importError: 'Could not import this file', jsonFilename: 'words-config.json' },
        selfRule: 'Your username',
        saveError: 'Could not save highlight settings.',
        saving: 'Saving…',
        saved: 'Saved',
        columns: { on: 'On', pattern: 'Pattern', sound: 'Sound', color: 'Color' },
        colorPicker: { title: 'Choose highlight color', defaultColors: 'Default colors', selected: 'Selected', hue: 'Hue', alpha: 'Transparency', hex: 'Hex (RRGGBBAA)', cancel: 'Cancel', ok: 'OK' },
        fixed: 'Fixed',
        emptyPattern: 'Empty pattern',
        dragToReorder: 'Drag to reorder',
        moveUp: 'Move up',
        moveDown: 'Move down',
        duplicate: 'Duplicate',
        remove: 'Remove',
        messageRule: 'Message rule',
        enabled: 'Enabled',
        color: 'Color',
        hexColor: 'Hex color',
        playSound: 'Play sound',
        customSound: 'Custom sound',
        builtInOrDefault: 'Built-in/default sound',
        browse: 'Browse',
        clear: 'Clear',
        test: 'Test',
        soundDefaults: 'Sound defaults',
        playWhileFocused: 'Play sounds while Yubblo is focused',
        defaultSound: 'Default sound',
        builtInSound: 'Built-in Yubblo sound'      },
      actionsHelp:
        'Moderation actions. In commands, use {username} to mention the user in the command.',
      noActions: 'No action buttons configured.',
      moderationLogs: {
        title: 'Moderation logs',
        help: 'Browse actions recorded while the app is open. Opens in a separate window.',
        open: 'Open logs'
      }
    },
    moderationLogs: {
      title: 'Moderation logs',
      sidebar: 'Channels and streams',
      emptyChannels: 'No logs yet. Actions appear here after you moderate while the app is open.',
      pickStream: 'Select a stream in the sidebar.',
      emptyEntries: 'No matching entries.',
      loading: 'Loading…',
      export: 'Export CSV',
      deleteStream: 'Delete stream logs',
      deleteConfirm: { title: 'Delete stream logs?', warning: 'This action cannot be undone.', cancel: 'Cancel', confirm: 'Delete', deleting: 'Deleting...', failed: 'Could not delete the stream logs.' },
      loadMore: 'Load more',
      showing: 'Showing {{shown}} of {{total}}',
      searchPlaceholder: 'User or moderator…',
      dateFrom: 'From date',
      dateTo: 'To date',
      summary: 'Summary',
      summaryTimeout: 'Timeouts: {{count}}',
      summaryDeleted: 'Deleted: {{count}}',
      summaryHide: 'Bans: {{count}}',
      summaryTotal: 'Total: {{count}}',
      unknownName: '(unknown)',
      col: {
        date: 'Date',
        time: 'Time',
        moderator: 'Moderator',
        user: 'User',
        action: 'Action',
        message: 'Message'
      },
      actions: {
        timeout: 'Timeout',
        deleted: 'Deleted',
        hide: 'Ban'
      }
    },
    update: {
      title: 'Yubblo update', available: 'A new version of Yubblo is available.',
      downloading: 'Downloading the update...', ready: 'The update is ready to install.',
      currentVersion: 'Current: {{version}}', newVersion: 'New: {{version}}',
      updateNow: 'Update now', later: 'Later', restartInstall: 'Restart and install',
      downloadingPercent: 'Downloading {{percent}}%', error: 'The update could not be downloaded.'
    },
    errors: {
      unknown: 'Unknown error',
      renderer: {
        rootMissing: 'Application root was not found.',
        renderFailed: 'Failed to render the application.'
      }
    },
    auth: {
      settings: 'Settings', moderationLogs: 'Moderation logs', accountsChannels: 'Accounts and channels', switchAccount: 'Switch account',
      localAccounts: 'Accounts on this PC', active: 'active', removeAccount: 'Remove from this list',
      switchYoutubeChannel: 'Switch YouTube channel...', addGoogleAccount: 'Add Google account...',
      logout: 'Sign out of this account', opening: 'Opening...', loginYoutube: 'Sign in with YouTube',
      channelsTitle: 'Channels for this account',
      channelsHelp: 'Select the Brand channel the app should use to send messages and moderate.',
      loadingChannels: 'Loading channels...',
      noChannels: 'No channels were listed. Confirm the login and try again.',
      inUse: 'in use',
      switchingChannel: 'Switching channel...',
      errors: {
        loginIncomplete: 'Sign-in was not completed.', loginFailed: 'Could not sign in.',
        accountNotAdded: 'The account was not added.', addAccountFailed: 'Could not add the account.',
        switchAccountFailed: 'Could not switch accounts.',
        removeAccountFailed: 'Could not remove the account.',
        noChannels: 'No channels were found for this Google account.'
      }
    },
    channels: {
      addStreamTitle: 'Add channel or live',
      addStreamHelp: 'Paste a @handle, channel link, or live video URL.',
      addStreamLabel: 'Channel / link', genericChannel: 'Channel',
      opening: 'Opening...',
      add: 'Add', close: 'Close', connecting: '{{channel}} — connecting...', offline: '{{channel}} — offline',
      chooseLive: 'Choose live stream', pickerHelp: '{{channel}} has {{count}} live streams. Which chat do you want to open?',
      current: 'Current', live: 'Live', stream: 'Stream', open: 'Open', directLinkHelp: 'You can also paste the direct live stream link.'
    },
    chat: {
      loginTitle: 'Sign in',
      notices: {
        slowModeEnabled: 'Slow mode is on.',
        slowModeDisabled: 'Slow mode is off.',
        slowModeInterval_one: 'Slow mode is on. Send a message every {{count}} second.',
        slowModeInterval_other: 'Slow mode is on. Send a message every {{count}} seconds.'
      },
      waitingMessages: 'Waiting for messages...',
      channelOffline: 'Channel offline',
      noLive: 'No live stream open',
      loginHint: 'Sign in with YouTube — cookies stay on this PC.',
      offlineHint: 'This channel is not streaming right now.',
      loginToSend: 'Log in to send messages...', openLive: 'Open a live stream to chat', sendMessage: 'Send message...',
      searchPlaceholder: 'Type to search',
      searchType: 'Type to search',
      searchNoResults: 'No results',
      searchMatchCount: '{{current}} / {{total}}',
      searchPrev: 'Previous match (Shift+Enter)',
      searchNext: 'Next match (Enter)',
      searchClose: 'Close search (Esc)',
      slowWait: 'Slow mode · wait {{seconds}}s', wait: 'Wait {{seconds}}s', emotes: 'Emotes', reply: 'Reply', replyTo: 'Reply to {{user}}', youtubeEmotes: 'YouTube emotes',
      emojiEmotes: 'Emoji', close: 'Close',
      youtubeSource: 'YouTube',
      channelEmotes: 'Channel', globalEmotes: 'Global', removedFallback: '[message removed]',
      searchEmote: 'Search emote...', loadingEmotes: 'Loading emotes...', youtubeEmotesLoading: 'Loading standard YouTube emotes... Open chat and wait for synchronization.',
      noChannelEmotes: 'This channel has no 7TV emotes. Check the Global tab.', noGlobalEmotes: 'No global emotes found.',
      noEmojiEmotes: 'No emoji found.',
      emoteHelp: 'YouTube = live chat emotes · 7TV = text tokens', pinnedMessage: 'Pinned message', pinned: 'Pinned', dismissPinned: 'Close pinned message',
      commands: { userUsage: 'Use /user @handle.', userNeedsLive: 'Open a live stream before using /user.' },
      deletedMessage: { show: 'View deleted message', hide: 'Hide deleted message' },
      heldReview: { badge: 'Held', header: 'Held for review', show: 'Show', hide: 'Hide', unavailable: 'Review actions unavailable - use YouTube' },
      message: {
        memberBadge: 'MEMBER', failed: 'failed',
        moderationTooltip: 'Moderation (also: right-click)',
        delete: 'Delete message', hide: 'Ban user', unhide: 'Unban user', unbanAction: 'Unban', unbanTitle: 'Unban {{user}}',
        timeout: 'Timeout {{duration}}'
      },
      systemModeration: {
        deleted: '{{target}} Message deleted by {{moderator}}',
        timeout: '{{target}} was timed out by {{moderator}} for {{duration}}.',
        hidden: '{{target}} was banned by {{moderator}}.',
        unhidden: '{{target}} was unbanned by {{moderator}}.',
        unknownTarget: '@user',
        unknownModerator: '@moderator',
        duration: {
          second_one: '{{count}} second', second_other: '{{count}} seconds',
          minute_one: '{{count}} minute', minute_other: '{{count}} minutes',
          hour_one: '{{count}} hour', hour_other: '{{count}} hours',
          day_one: '{{count}} day', day_other: '{{count}} days'
        }
      },
      scrollPaused: 'Chat Paused'
    },
    moderation: {
      title: 'Moderation', timeoutDuration: 'Timeout duration', loading: 'Loading...',
      back: '← Back', cancel: 'Cancel', channelActivity: 'Channel activity',
      monitorUser: 'Monitor user', stopMonitoring: 'Stop monitoring',
      actions: { delete: 'Delete message', timeout: 'Timeout', hide: 'Ban user', unhide: 'Unban user' },
      errors: {
        emptyCommand: 'The command is empty after expanding placeholders.',
        noPermission: 'You do not have moderation permission in this live stream.',
        durationUnavailable: 'Duration {{duration}} is not available in this chat. Options: {{options}}',
        noOptions: 'none', deleteUnavailable: 'Delete is not available in this menu.',
        hideUnavailable: 'Ban is not available in this menu.',
        unhideUnavailable: 'Unban is not available in this menu. Use YouTube or Studio.',
        noActions: 'No moderation actions are available. Confirm that your account is a moderator or owner of this live stream.'
      }
    },
    channelActivity: { title: 'Channel activity', moderationActions: 'Moderation actions', openUserActivity: 'Open channel activity for {{user}}', ban: 'Ban', running: 'Working…', timeoutApplied: 'Timeout applied.', banApplied: 'User banned.', moderationFailed: 'Could not apply the moderation action.', back: 'Back', close: 'Close', deleted: 'Deleted messages', timeouts: 'Timeouts', hides: 'Hidden', moderatedLastYear: 'Moderated activities in the last year', messagesLastYear: 'Chat messages in the last year', count: '{{count}} messages', loadMore: 'Load more', loading: 'Loading...', unavailable: 'Channel activity is unavailable.' }
  },
  'pt-BR': {
    common: {
      actions: { add: 'Adicionar', close: 'Fechar', remove: 'Remover' },
      language: { english: 'English', portugueseBrazil: 'Português (Brasil)' },
      status: {
        enterChannel: 'Informe um canal para abrir o chat',
        loginRequired: 'Entre com sua conta do YouTube para continuar',
        connectingChannels: 'Conectando {{count}} canais...',
        connectingChat: 'Conectando ao chat...',
        replay: 'Replay do chat — {{title}} ({{channel}})',
        unlisted: 'Chat aberto (não listado / não marcado ao vivo) — {{title}}',
        live: 'Ao vivo — {{title}} ({{channel}})',
        ended: 'Transmissão encerrada ou chat finalizado',
        offlineNamed: 'Canal offline - {{channel}}',
        offline: 'Canal offline',
        otherLives: 'Outras transmissões ao vivo deste canal — clique para trocar',
        liveCount: '{{count}} ao vivo',
        focusMode: 'Foco',
        enableFocusMode: 'Ativar Modo Foco',
        disableFocusMode: 'Desativar Modo Foco'
      },
      errors: {
        unknown: 'Erro desconhecido',
        loginRequired: 'Entre com sua conta do YouTube primeiro.',
        chatOpenFailed: 'Não foi possível abrir o chat.',
        chatListFailed: 'Não foi possível listar as transmissões.',
        sendFailed: 'Não foi possível enviar a mensagem.',
        clearActiveOnly: 'Somente a aba ativa pode ser limpa.',
        pollVoteFailed: 'Não foi possível votar na enquete.',
        moderationMenuFailed: 'Não foi possível abrir o menu de moderação.',
        moderationActionFailed: 'Não foi possível aplicar a ação de moderação.',
        unhideFailed: 'Não foi possível desbanir o usuário.',
        chatUnavailable: 'Este chat não está mais disponível.',
        channelNotFound: 'O canal não foi encontrado.',
        notLive: 'Nenhuma transmissão ao vivo foi encontrada neste canal.',
        network: 'Ocorreu um erro de rede.',
        authFailed: 'A autenticação do YouTube falhou.',
        noModerationEndpoint: 'A ação de moderação não está mais disponível.',
        renderer: {
          rootMissing: 'A raiz do aplicativo não foi encontrada.',
          renderFailed: 'Não foi possível renderizar o aplicativo.',
          preloadMissing: 'A ponte do Electron não está disponível. Feche e abra o app novamente.'
        }
      }
    },
    settings: {
      title: 'Configurações',
      description: 'Destaques, botões de ação e preferências do aplicativo.',
      tabs: { language: 'Idioma', highlights: 'Destaques', actions: 'Botões de ação' },
      nav: {
        general: 'Geral',
        highlights: 'Destaques',
        monitoring: 'Monitorados',
        actions: 'Botões de ação'
      },
      groups: { application: 'Aplicativo', moderation: 'Moderação' },
      monitoring: {
        title: 'Usuários monitorados',
        help: 'Usuários adicionados aqui ou pelo menu da mensagem são destacados em todos os canais.',
        namePlaceholder: 'Nome do usuário',
        add: 'Adicionar',
        color: 'Cor do monitoramento',
        colorHelp: 'Esta cor tem prioridade sobre qualquer outro destaque de mensagem.',
        empty: 'Nenhum usuário monitorado.',
        userColor: 'Cor de {{user}}',
        useDefaultColor: 'Usar cor padrão para {{user}}',
        remove: 'Parar de monitorar {{user}}'
      },
      bulkColors: {
        change: 'Alterar cor ({{count}})',
        clear: 'Limpar seleção',
        selectAllHighlights: 'Selecionar todos os destaques',
        selectAllMonitored: 'Selecionar todos os usuários monitorados',
        selectRule: 'Selecionar {{rule}}',
        selectUser: 'Selecionar {{user}}'
      },
      language: {
        title: 'Idioma do aplicativo',
        help: 'As alterações são aplicadas imediatamente à interface e às sessões do YouTube.'
      },
      update: {
        title: 'Atualizações', currentVersion: 'Versão atual: {{version}}',
        check: 'Verificar atualizações', checking: 'Verificando...', error: 'Não foi possível verificar atualizações.',
        status: { idle: 'Pronto para verificar', checking: 'Verificando atualizações', available: 'A versão {{version}} está disponível', downloading: 'Baixando atualização', downloaded: 'Pronta para instalar', 'up-to-date': 'O Yubblo está atualizado', error: 'Falha na verificação', unsupported: 'Disponível na versão instalada para Windows' }
      },
      chat: {
        title: 'Chat',
        fontSize: 'Tamanho da fonte do chat',
        fontSizeHelp: 'Altera o tamanho do texto das mensagens e dos avisos do chat.',
        pauseOnHover: 'Pausar a rolagem do chat ao passar o mouse',
        pauseOnHoverHelp:
          'Novas mensagens continuam chegando. Ao retirar o ponteiro do chat, a rolagem volta para a mensagem mais recente.',
        showFocusModeShortcut: 'Mostrar atalho do Modo Foco',
        showFocusModeShortcutHelp:
          'Adiciona um botão Foco global à linha de status do chat. O Modo Foco inicia desligado sempre que o Yubblo é aberto.'
      },
      highlightsHelp:
        'Ordem = prioridade. A primeira regra que bater define a cor da linha em todas as abas.',
      highlightPlaceholder: 'Palavra ou frase…',
      wholeWord: 'palavra',
      addRule: 'Adicionar regra',
      noHighlights: 'Nenhuma regra de destaque ainda.',
      highlightRules: {
        messages: 'Mensagens',
        help: 'As regras são avaliadas de cima para baixo. A primeira correspondência controla a cor e o som.',
        filterPlaceholder: 'Filtrar regras…',
        add: 'Adicionar regra',
        newPattern: 'Novo destaque',
        transfer: { import: 'Importar', export: 'Exportar', imported: '{{count}} regras importadas', importError: 'Não foi possível importar este arquivo', jsonFilename: 'palavras-config.json' },
        selfRule: 'Seu nome de usuário',
        saveError: 'Não foi possível salvar as configurações de destaque.',
        saving: 'Salvando…',
        saved: 'Salvo',
        columns: { on: 'Ativa', pattern: 'Padrão', sound: 'Som', color: 'Cor' },
        colorPicker: { title: 'Escolher cor do destaque', defaultColors: 'Cores padrão', selected: 'Selecionada', hue: 'Matiz', alpha: 'Transparência', hex: 'Hex (RRGGBBAA)', cancel: 'Cancelar', ok: 'OK' },
        fixed: 'Fixa',
        emptyPattern: 'Padrão vazio',
        dragToReorder: 'Arraste para reordenar',
        moveUp: 'Mover para cima',
        moveDown: 'Mover para baixo',
        duplicate: 'Duplicar',
        remove: 'Remover',
        messageRule: 'Regra de mensagem',
        enabled: 'Ativada',
        color: 'Cor',
        hexColor: 'Cor hexadecimal',
        playSound: 'Reproduzir som',
        customSound: 'Som personalizado',
        builtInOrDefault: 'Som interno/padrão',
        browse: 'Procurar',
        clear: 'Limpar',
        test: 'Testar',
        soundDefaults: 'Padrões de som',
        playWhileFocused: 'Reproduzir sons enquanto o Yubblo estiver em foco',
        defaultSound: 'Som padrão',
        builtInSound: 'Som interno do Yubblo'      },
      actionsHelp:
        'Ações de moderação. Em comandos, use {username} para marcar o usuário no comando.',
      noActions: 'Nenhum botão de ação configurado.',
      moderationLogs: {
        title: 'Registros de moderação',
        help: 'Veja ações gravadas enquanto o app está aberto. Abre em janela separada.',
        open: 'Abrir registros'
      }
    },
    moderationLogs: {
      title: 'Registros de moderação',
      sidebar: 'Canais e transmissões',
      emptyChannels:
        'Nenhum registro ainda. As ações aparecem aqui depois que você moderar com o app aberto.',
      pickStream: 'Selecione uma transmissão na barra lateral.',
      emptyEntries: 'Nenhuma entrada correspondente.',
      loading: 'Carregando…',
      export: 'Exportar CSV',
      deleteStream: 'Apagar registros da transmissão',
      deleteConfirm: { title: 'Apagar registros da transmissão?', warning: 'Esta ação não pode ser desfeita.', cancel: 'Cancelar', confirm: 'Apagar', deleting: 'Apagando...', failed: 'Não foi possível apagar os registros da transmissão.' },
      loadMore: 'Carregar mais',
      showing: 'Mostrando {{shown}} de {{total}}',
      searchPlaceholder: 'Usuário ou moderador…',
      dateFrom: 'Data inicial',
      dateTo: 'Data final',
      summary: 'Resumo',
      summaryTimeout: 'Timeouts: {{count}}',
      summaryDeleted: 'Apagadas: {{count}}',
      summaryHide: 'Bans: {{count}}',
      summaryTotal: 'Total: {{count}}',
      unknownName: '(desconhecido)',
      col: {
        date: 'Data',
        time: 'Hora',
        moderator: 'Moderador',
        user: 'Usuário',
        action: 'Ação',
        message: 'Mensagem'
      },
      actions: {
        timeout: 'Timeout',
        deleted: 'Apagada',
        hide: 'Ban'
      }
    },
    update: {
      title: 'Atualização do Yubblo', available: 'Uma nova versão do Yubblo está disponível.',
      downloading: 'Baixando a atualização...', ready: 'A atualização está pronta para instalar.',
      currentVersion: 'Atual: {{version}}', newVersion: 'Nova: {{version}}',
      updateNow: 'Atualizar agora', later: 'Mais tarde', restartInstall: 'Reiniciar e instalar',
      downloadingPercent: 'Baixando {{percent}}%', error: 'Não foi possível baixar a atualização.'
    },
    errors: {
      unknown: 'Erro desconhecido',
      renderer: {
        rootMissing: 'A raiz do aplicativo não foi encontrada.',
        renderFailed: 'Não foi possível renderizar o aplicativo.'
      }
    },
    auth: {
      settings: 'Configurações', moderationLogs: 'Registros de moderação', accountsChannels: 'Contas e canais', switchAccount: 'Trocar conta',
      localAccounts: 'Contas neste PC', active: 'ativa', removeAccount: 'Remover desta lista',
      switchYoutubeChannel: 'Trocar canal do YouTube...', addGoogleAccount: 'Adicionar conta Google...',
      logout: 'Sair desta conta', opening: 'Abrindo...', loginYoutube: 'Entrar com YouTube',
      channelsTitle: 'Canais desta conta',
      channelsHelp: 'Selecione o canal Brand que o aplicativo deve usar para enviar mensagens e moderar.',
      loadingChannels: 'Carregando canais...',
      noChannels: 'Nenhum canal foi listado. Confirme o login e tente novamente.',
      inUse: 'em uso',
      switchingChannel: 'Trocando canal...',
      errors: {
        loginIncomplete: 'O login não foi concluído.', loginFailed: 'Não foi possível entrar.',
        accountNotAdded: 'A conta não foi adicionada.', addAccountFailed: 'Não foi possível adicionar a conta.',
        switchAccountFailed: 'Não foi possível trocar de conta.',
        removeAccountFailed: 'Não foi possível remover a conta.',
        noChannels: 'Nenhum canal foi encontrado nesta conta Google.'
      }
    },
    channels: {
      addStreamTitle: 'Adicionar canal ou live',
      addStreamHelp: 'Cole um @handle, link do canal ou URL da live.',
      addStreamLabel: 'Canal / link', genericChannel: 'Canal',
      opening: 'Abrindo...',
      add: 'Adicionar', close: 'Fechar', connecting: '{{channel}} — conectando...', offline: '{{channel}} — offline',
      chooseLive: 'Escolher transmissão', pickerHelp: '{{channel}} tem {{count}} transmissões ao vivo. Qual chat você quer abrir?',
      current: 'Atual', live: 'Ao vivo', stream: 'Transmissão', open: 'Abrir', directLinkHelp: 'Você também pode colar o link direto da transmissão.'
    },
    chat: {
      loginTitle: 'Faça login',
      notices: {
        slowModeEnabled: 'Modo lento ativado.',
        slowModeDisabled: 'Modo lento desativado.',
        slowModeInterval_one: 'Modo lento ativado. Envie uma mensagem a cada {{count}} segundo.',
        slowModeInterval_other: 'Modo lento ativado. Envie uma mensagem a cada {{count}} segundos.'
      },
      waitingMessages: 'Aguardando mensagens...',
      channelOffline: 'Canal offline',
      noLive: 'Nenhuma transmissão ao vivo aberta',
      loginHint: 'Entre com o YouTube — os cookies ficam somente neste PC.',
      offlineHint: 'Este canal não está transmitindo no momento.',
      loginToSend: 'Faça login para enviar mensagens...', openLive: 'Abra uma transmissão ao vivo para conversar', sendMessage: 'Enviar mensagem...',
      searchPlaceholder: 'Digite para buscar',
      searchType: 'Digite para buscar',
      searchNoResults: 'Sem resultados',
      searchMatchCount: '{{current}} / {{total}}',
      searchPrev: 'Anterior (Shift+Enter)',
      searchNext: 'Próximo (Enter)',
      searchClose: 'Fechar busca (Esc)',
      emojiEmotes: 'Emoji', close: 'Fechar',
      youtubeSource: 'YouTube',
      slowWait: 'Modo lento · aguarde {{seconds}}s', wait: 'Aguarde {{seconds}}s', emotes: 'Emotes', reply: 'Responder', replyTo: 'Responder a {{user}}', youtubeEmotes: 'Emotes do YouTube',
      channelEmotes: 'Canal', globalEmotes: 'Global', removedFallback: '[mensagem removida]',
      noEmojiEmotes: 'Nenhum emoji encontrado.',
      searchEmote: 'Buscar emote...', loadingEmotes: 'Carregando emotes...', youtubeEmotesLoading: 'Carregando emotes padrão do YouTube... Abra o chat e aguarde a sincronização.',
      noChannelEmotes: 'Este canal não possui emotes 7TV. Veja a aba Global.', noGlobalEmotes: 'Nenhum emote global foi encontrado.',
      emoteHelp: 'YouTube = emotes do chat ao vivo · 7TV = tokens de texto', pinnedMessage: 'Mensagem fixada', pinned: 'Fixado', dismissPinned: 'Fechar mensagem fixada',
      commands: { userUsage: 'Use /user @handle.', userNeedsLive: 'Abra uma transmissão antes de usar /user.' },
      deletedMessage: { show: 'Ver mensagem apagada', hide: 'Ocultar mensagem' },
      heldReview: { badge: 'Retido', header: 'Retido para revisão', show: 'Mostrar', hide: 'Ocultar', unavailable: 'Ações de revisão indisponíveis - use o YouTube' },
      message: {
        memberBadge: 'MEMBRO', failed: 'falhou',
        moderationTooltip: 'Moderação (também: botão direito)',
        delete: 'Apagar mensagem', hide: 'Banir usuário', unhide: 'Desbanir usuário', unbanAction: 'Desbanir', unbanTitle: 'Desbanir {{user}}',
        timeout: 'Timeout {{duration}}'
      },
      systemModeration: {
        deleted: '{{target}} Mensagem apagada por {{moderator}}',
        timeout: '{{target}} foi pausado temporariamente por {{moderator}} por {{duration}}.',
        hidden: '{{target}} foi banido por {{moderator}}.',
        unhidden: '{{target}} foi desbanido por {{moderator}}.',
        unknownTarget: '@usuário',
        unknownModerator: '@moderador',
        duration: {
          second_one: '{{count}} segundo', second_other: '{{count}} segundos',
          minute_one: '{{count}} minuto', minute_other: '{{count}} minutos',
          hour_one: '{{count}} hora', hour_other: '{{count}} horas',
          day_one: '{{count}} dia', day_other: '{{count}} dias'
        }
      },
      scrollPaused: 'Chat Parado'
    },
    moderation: {
      title: 'Moderação', timeoutDuration: 'Duração do timeout', loading: 'Carregando...',
      back: '← Voltar', cancel: 'Cancelar', channelActivity: 'Atividade do canal',
      monitorUser: 'Monitorar usuário', stopMonitoring: 'Parar de monitorar',
      actions: { delete: 'Apagar mensagem', timeout: 'Suspender', hide: 'Banir usuário', unhide: 'Desbanir usuário' },
      errors: {
        emptyCommand: 'O comando ficou vazio após expandir os placeholders.',
        noPermission: 'Sem permissão de moderação nesta live.',
        durationUnavailable: 'A duração {{duration}} não está disponível neste chat. Opções: {{options}}',
        noOptions: 'nenhuma', deleteUnavailable: 'Apagar não está disponível neste menu.',
        hideUnavailable: 'Banir não está disponível neste menu.',
        unhideUnavailable: 'Desbanir não está disponível neste menu. Use o YouTube ou o Studio.',
        noActions: 'Não há ações de moderação. Confirme que sua conta é moderadora ou dona desta live.'
      }
    },
    channelActivity: { title: 'Atividade do canal', moderationActions: 'Ações de moderação', openUserActivity: 'Abrir atividade do canal de {{user}}', ban: 'Ban', running: 'Executando…', timeoutApplied: 'Timeout aplicado.', banApplied: 'Usuário banido.', moderationFailed: 'Não foi possível aplicar a ação de moderação.', back: 'Voltar', close: 'Fechar', deleted: 'Mensagens excluídas', timeouts: 'Suspensões temporárias', hides: 'Ocultações', moderatedLastYear: 'Atividades moderadas no último ano', messagesLastYear: 'Mensagens no chat no último ano', count: '{{count}} mensagens', loadMore: 'Carregar mais', loading: 'Carregando...', unavailable: 'A atividade do canal não está disponível.' }
  }
} as const
