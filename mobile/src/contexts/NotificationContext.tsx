import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform, AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { api } from '../lib/api';

// Configurar como as notificações aparecem quando o app está em primeiro plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
    activeChatRef.current = activeChatId;
  }, [activeChatId]);

  // Solicitar permissão de notificação
  useEffect(() => {
    requestNotificationPermission();
  }, []);

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

          // Ignorar se o usuário está no chat que recebeu a mensagem E o app está ativo
          const appIsActive = AppState.currentState === 'active';
          if (appIsActive && activeChatRef.current === msg.chat_id) return;

          // Buscar nome do chat e do remetente para a notificação
          let chatName = 'Chat';
          let senderName = msg.display_name || 'Alguém';

          try {
            const chatResult = await api.getChats(undefined, msg.chat_id);
            if (chatResult?.data?.name) chatName = chatResult.data.name;
          } catch {}

          // Montar corpo da notificação
          let body = msg.content || '';
          if (msg.message_type === 'image') body = '📷 Foto';
          else if (msg.message_type === 'audio') body = '🎵 Áudio';
          else if (msg.message_type === 'document') body = `📄 ${msg.media_name || 'Documento'}`;
          else if (body.length > 60) body = body.substring(0, 60) + '...';

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

async function requestNotificationPermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Mensagens',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing !== 'granted') {
    await Notifications.requestPermissionsAsync();
  }
}
