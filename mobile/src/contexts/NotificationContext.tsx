import { useEffect, useRef } from 'react';
import Constants from 'expo-constants';
import { Platform, AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';

const isExpoGo = Constants.appOwnership === 'expo';

async function getNotificationsModule() {
  const Notifications = await import('expo-notifications');
  return Notifications;
}

/**
 * Hook para registrar e exibir notificações locais quando novas mensagens chegam.
 * Deve ser montado uma vez na raiz do app (em _layout.tsx).
 * Mostra notificação quando o usuário NÃO está visualizando o chat em questão.
 */
export function useNotifications(activeChatId?: string) {
  const { profile } = useAuth();
  const activeChatRef = useRef<string | undefined>(activeChatId);
  const lastMessageIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isExpoGo) return;
    let mounted = true;
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
    })();
    return () => {
      mounted = false;
    };
  }, []);

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

  // Inscrever no Supabase Realtime para TODAS as mensagens dos chats do usuário
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel('global-new-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const msg = payload.new as any;
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

          // Buscar nome do chat e do remetente para a notificação
          let chatName = 'Chat';
          let senderName = msg.display_name || 'Alguém';

          try {
            const chatResult = await api.getChats(undefined, msg.chat_id);
            if (!chatResult?.data) return;
            if (chatResult.data.name) chatName = chatResult.data.name;
          } catch {
            return;
          }

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
            },
            trigger: null, // imediato
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);
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
