import { useEffect, useRef, useState, useCallback } from 'react';
import Constants from 'expo-constants';
import { Platform, AppState } from 'react-native';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';
import { useWebSocket } from './WebSocketContext';

const isExpoGo = Constants.appOwnership === 'expo';

async function getNotificationsModule() {
  const Notifications = await import('expo-notifications');
  return Notifications;
}

// Estado global de não lidas — compartilhado entre telas
const unreadMap = new Map<string, number>();
const unreadListeners = new Set<() => void>();
const unreadActiveChatMap = new Map<string, number>();
const unreadSubscriptions = new Map<string, () => void>();
const unreadMessageIds = new Set<string>();
let unreadProfileId: string | null = null;
let unreadSyncPromise: Promise<void> | null = null;

function serializeUnreadMap(): Record<string, number> {
  return Object.fromEntries(unreadMap.entries());
}

function notifyUnreadListeners() {
  unreadListeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

function resetUnreadSubscriptions() {
  unreadSubscriptions.forEach((unsub) => {
    try { unsub(); } catch {}
  });
  unreadSubscriptions.clear();
  unreadMessageIds.clear();
}

function isChatActive(chatId?: string): boolean {
  if (!chatId) return false;
  return (unreadActiveChatMap.get(chatId) || 0) > 0;
}

function incrementUnread(chatId: string) {
  unreadMap.set(chatId, (unreadMap.get(chatId) || 0) + 1);
  notifyUnreadListeners();
}

async function ensureUnreadSubscriptions(
  profileId: string,
  subscribeChatMessages: (chatId: string, listener: (msg: any) => void) => () => void,
) {
  if (!profileId) return;

  if (unreadProfileId !== profileId) {
    resetUnreadSubscriptions();
    unreadProfileId = profileId;
    unreadMap.clear();
    notifyUnreadListeners();
  }

  if (unreadSyncPromise) {
    await unreadSyncPromise;
    return;
  }

  unreadSyncPromise = (async () => {
    try {
      const companiesResult = await api.getUserCompanies();
      const companies = companiesResult?.data || [];

      for (const company of companies) {
        const chatsResult = await api.getChats(company.id);
        const chats = chatsResult?.data || [];

        for (const chat of chats) {
          if (!chat?.id || unreadSubscriptions.has(chat.id)) continue;
          const unsub = subscribeChatMessages(chat.id, (msg) => {
            if (!msg?.id || !msg?.chat_id) return;
            if (msg.user_profile_id === unreadProfileId) return;
            if (unreadMessageIds.has(msg.id)) return;
            unreadMessageIds.add(msg.id);
            if (unreadMessageIds.size > 2000) {
              const keep = Array.from(unreadMessageIds).slice(-1000);
              unreadMessageIds.clear();
              keep.forEach((id) => unreadMessageIds.add(id));
            }
            if (isChatActive(msg.chat_id)) return;
            incrementUnread(msg.chat_id);
          });
          unreadSubscriptions.set(chat.id, unsub);
        }
      }
    } catch {
      // Falha silenciosa para não bloquear o app.
    } finally {
      unreadSyncPromise = null;
    }
  })();

  await unreadSyncPromise;
}

export function useUnreadCounts(activeChatId?: string) {
  const { profile } = useAuth();
  const { subscribeChatMessages } = useWebSocket();
  const [counts, setCounts] = useState<Record<string, number>>(() => serializeUnreadMap());
  const activeChatRef = useRef<string | undefined>(activeChatId);

  useEffect(() => {
    const syncCounts = () => {
      setCounts(serializeUnreadMap());
    };
    unreadListeners.add(syncCounts);
    syncCounts();
    return () => {
      unreadListeners.delete(syncCounts);
    };
  }, []);

  useEffect(() => {
    if (!profile?.id) {
      unreadProfileId = null;
      resetUnreadSubscriptions();
      unreadMap.clear();
      notifyUnreadListeners();
      setCounts({});
      return;
    }
    ensureUnreadSubscriptions(profile.id, subscribeChatMessages).catch(() => {});
  }, [profile?.id, subscribeChatMessages]);

  useEffect(() => {
    const prevChatId = activeChatRef.current;
    if (prevChatId && prevChatId !== activeChatId) {
      const current = unreadActiveChatMap.get(prevChatId) || 0;
      if (current <= 1) unreadActiveChatMap.delete(prevChatId);
      else unreadActiveChatMap.set(prevChatId, current - 1);
    }

    if (activeChatId) {
      unreadActiveChatMap.set(activeChatId, (unreadActiveChatMap.get(activeChatId) || 0) + 1);
    }
    activeChatRef.current = activeChatId;

    return () => {
      const chatId = activeChatRef.current;
      if (!chatId) return;
      const current = unreadActiveChatMap.get(chatId) || 0;
      if (current <= 1) unreadActiveChatMap.delete(chatId);
      else unreadActiveChatMap.set(chatId, current - 1);
    };
  }, [activeChatId]);

  const markChatAsRead = useCallback((chatId: string) => {
    if (!chatId) return;
    unreadMap.set(chatId, 0);
    notifyUnreadListeners();
    setCounts((prev) => ({ ...prev, [chatId]: 0 }));
  }, []);

  const totalUnread = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return { counts, totalUnread, markChatAsRead };
}

/**
 * Hook para registrar e exibir notificações locais quando novas mensagens chegam.
 * Deve ser montado uma vez na raiz do app (em _layout.tsx).
 * Mostra notificação quando o usuário NÃO está visualizando o chat em questão.
 */
export function useNotifications(activeChatId?: string) {
  const { profile } = useAuth();
  const { subscribeChatMessages, subscribeAdminAlerts } = useWebSocket();
  const activeChatRef = useRef<string | undefined>(activeChatId);
  const lastMessageIds = useRef<Set<string>>(new Set());
  const chatNamesRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (isExpoGo) return;
    let mounted = true;
    let responseSub: { remove: () => void } | null = null;
    (async () => {
      const Notifications = await getNotificationsModule();
      if (!mounted) return;
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
      // Registrar categoria com ação de resposta inline (Android e iOS)
      await Notifications.setNotificationCategoryAsync('MESSAGE_REPLY', [
        {
          identifier: 'reply',
          buttonTitle: 'Responder',
          options: { opensAppToForeground: false },
          textInput: {
            submitButtonTitle: 'Enviar',
            placeholder: 'Digite uma mensagem...',
          },
        },
      ]);
      // Escutar resposta inline da notificação
      responseSub = Notifications.addNotificationResponseReceivedListener(async (response) => {
        if (response.actionIdentifier !== 'reply') return;
        const chatId = response.notification.request.content.data?.chatId as string | undefined;
        const userText = (response as any).userText as string | undefined;
        const profileId = profile?.id;
        if (chatId && userText?.trim() && profileId) {
          await api.sendMessage(chatId, userText.trim(), profileId).catch(() => {});
        }
      });
    })();
    return () => {
      mounted = false;
      responseSub?.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  useEffect(() => {
    activeChatRef.current = activeChatId;
  }, [activeChatId]);

  // Solicitar permissão de notificação e registrar push token no backend
  useEffect(() => {
    if (isExpoGo) return;
    if (!profile?.id) return;
    requestNotificationPermission().then((pushToken) => {
      if (pushToken) {
        // Salvar no backend de forma silenciosa
        api.savePushToken(pushToken).catch(() => {
          // Falha silenciosa — não critica o fluxo do app
        });
      }
    });
  }, [profile?.id]);

  // Inscrever via WebSocket em todos os chats do usuário para notificações locais
  useEffect(() => {
    if (!profile?.id) return;

    let cancelled = false;
    const unsubs: Array<() => void> = [];

    const scheduleLocalNotification = async (msg: any) => {
      if (!msg) return;

      // Ignorar próprias mensagens
      if (msg.user_profile_id === profile.id) return;

      // Ignorar mensagem se já processada
      if (lastMessageIds.current.has(msg.id)) return;
      lastMessageIds.current.add(msg.id);
      if (lastMessageIds.current.size > 2000) {
        lastMessageIds.current = new Set(Array.from(lastMessageIds.current).slice(-1000));
      }

      if (isExpoGo) return;

      // Ignorar se o usuário está no chat que recebeu a mensagem E o app está ativo
      const appIsActive = AppState.currentState === 'active';
      if (appIsActive && activeChatRef.current === msg.chat_id) return;

      const chatName = chatNamesRef.current.get(msg.chat_id) || 'Chat';
      const senderName = msg.display_name || 'Alguém';

      // Montar corpo da notificação
      let body = msg.content || '';
      if (msg.message_type === 'image') body = '📷 Foto';
      else if (msg.message_type === 'audio') body = '🎵 Áudio';
      else if (msg.message_type === 'document') body = `📄 ${msg.media_name || 'Documento'}`;
      else if (body.length > 60) body = body.substring(0, 60) + '...';

      const Notifications = await getNotificationsModule();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${senderName} em ${chatName}`,
          body,
          data: { chatId: msg.chat_id },
          sound: true,
          categoryIdentifier: 'MESSAGE_REPLY',
          ...(Platform.OS === 'android' ? { android: { channelId: 'messages' } } : {}),
        } as any,
        trigger: null, // imediato
      });
    };

    const subscribeAllChats = async () => {
      try {
        const companiesResult = await api.getUserCompanies();
        const companies = companiesResult?.data || [];
        if (cancelled) return;

        const chatMap = new Map<string, string>();
        for (const company of companies) {
          const chatsResult = await api.getChats(company.id);
          const chats = chatsResult?.data || [];
          for (const chat of chats) {
            if (chat?.id) {
              chatMap.set(chat.id, chat.name || 'Chat');
            }
          }
        }

        if (cancelled) return;
        chatNamesRef.current = chatMap;

        for (const company of companies) {
          const unsub = subscribeAdminAlerts(company.id, async (alert) => {
            if (isExpoGo) return;
            const Notifications = await getNotificationsModule();
            await Notifications.scheduleNotificationAsync({
              content: {
                title: '⚠️ Alerta do Sistema',
                body: alert.description || `Erro ${alert.status} em ${alert.endpoint}`,
                data: { type: 'admin_alert', companyId: alert.company_id },
                sound: true,
              },
              trigger: null,
            });
          });
          unsubs.push(unsub);
        }

        for (const chatId of chatMap.keys()) {
          const unsub = subscribeChatMessages(chatId, (msg) => {
            scheduleLocalNotification(msg).catch(() => {});
          });
          unsubs.push(unsub);
        }
      } catch {
        // Sem fallback adicional: push notifications continuam funcionando via backend.
      }
    };

    subscribeAllChats().catch(() => {});

    return () => {
      cancelled = true;
      unsubs.forEach((fn) => {
        try { fn(); } catch {}
      });
    };
  }, [profile?.id, subscribeChatMessages, subscribeAdminAlerts]);
}

async function requestNotificationPermission(): Promise<string | null> {
  const Notifications = await getNotificationsModule();

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Mensagens',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  try {
    const projectId =
      (Constants as any)?.expoConfig?.extra?.eas?.projectId ||
      (Constants as any)?.easConfig?.projectId;

    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    return tokenData.data ?? null;
  } catch {
    return null;
  }
}
