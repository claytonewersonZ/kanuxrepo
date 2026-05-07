import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import { useAuth } from './AuthContext';
import { getApiUrl } from '../lib/api';
import { supabase } from '../lib/supabase';

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface WsMessage {
  id: string;
  chat_id: string;
  user_profile_id: string;
  display_name: string;
  content: string;
  message_type: string;
  media_url?: string | null;
  media_name?: string | null;
  attachments: string;
  created_at: string;
  source?: string;
}

export interface WsErrorAlert {
  type: 'ERROR_ALERT';
  status: number;
  method: string;
  endpoint: string;
  user_name: string;
  description: string;
  company_id: string;
  timestamp: string;
}

export interface WsTicketComment {
  id: string;
  ticket_id: string;
  user_profile_id: string;
  content: string;
  created_at: string;
  user_profile?: {
    id: string;
    display_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  };
}

type MessageListener = (msg: WsMessage) => void;
type AlertListener = (alert: WsErrorAlert) => void;
type TicketCommentListener = (comment: WsTicketComment) => void;
export type TypingPayload = { user_profile_id: string; display_name: string; typing: boolean };
type TypingListener = (payload: TypingPayload) => void;

interface WebSocketContextType {
  isConnected: boolean;
  /** Inscreve um listener para novas mensagens de um chat específico */
  subscribeChatMessages: (chatId: string, listener: MessageListener) => () => void;
  /** Inscreve um listener para alertas de erros admin de uma empresa */
  subscribeAdminAlerts: (companyId: string, listener: AlertListener) => () => void;
  /** Inscreve um listener para comentários de ticket */
  subscribeTicketComments: (ticketId: string, listener: TicketCommentListener) => () => void;
  /** Inscreve um listener para status de digitação de um chat */
  subscribeChatTyping: (chatId: string, listener: TypingListener) => () => void;
  /** Envia mensagem via WebSocket */
  sendMessageWs: (
    chatId: string,
    content: string,
    messageType?: string,
    mediaUrl?: string,
    mediaName?: string,
    clientMessageId?: string
  ) => boolean;
  /** Envia evento de digitação via WebSocket */
  sendTypingWs: (chatId: string, isTyping: boolean) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

// ── Provider ───────────────────────────────────────────────────────────────────

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { profile, isOnline } = useAuth();
  const [isConnected, setIsConnected] = useState(false);

  const clientRef = useRef<Client | null>(null);

  // Map chatId → Set<MessageListener>
  const chatListenersRef = useRef<Map<string, Set<MessageListener>>>(new Map());
  // Map companyId → Set<AlertListener>
  const alertListenersRef = useRef<Map<string, Set<AlertListener>>>(new Map());
  // Map ticketId → Set<TicketCommentListener>
  const ticketListenersRef = useRef<Map<string, Set<TicketCommentListener>>>(new Map());
  // Map chatId → Set<TypingListener>
  const typingListenersRef = useRef<Map<string, Set<TypingListener>>>(new Map());
  // Subscriptions STOMP ativas: topic → StompSubscription
  const stompSubsRef = useRef<Map<string, StompSubscription>>(new Map());

  const getWsUrl = useCallback((): string => {
    const apiUrl = getApiUrl();
    // https://... → wss://... | http://... → ws://...
    return apiUrl.replace(/^https/, 'wss').replace(/^http/, 'ws') + '/ws-native';
  }, []);

  const connect = useCallback(async () => {
    if (!profile || !isOnline) return;
    if (clientRef.current?.active) return;

    // Obter token JWT fresco
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    const wsUrl = getWsUrl();
    console.log('[WS] Conectando em', wsUrl);

    const client = new Client({
      webSocketFactory: () => new WebSocket(wsUrl),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        console.log('[WS] Conectado ao STOMP backend');
        setIsConnected(true);

        // Re-inscrever em todos os tópicos ativos após reconexão
        resubscribeAll(client);
      },
      onDisconnect: () => {
        console.log('[WS] Desconectado do STOMP');
        setIsConnected(false);
        stompSubsRef.current.clear();
      },
      onStompError: (frame) => {
        console.warn('[WS] Erro STOMP:', frame.headers?.message);
      },
      onWebSocketError: (evt) => {
        console.warn('[WS] Erro WebSocket:', evt);
      },
    });

    clientRef.current = client;
    client.activate();
  }, [getWsUrl, isOnline, profile]);

  function resubscribeAll(client: Client) {
    stompSubsRef.current.clear();

    // Re-inscrever tópicos de chat ativos
    for (const chatId of chatListenersRef.current.keys()) {
      const sub = client.subscribe(`/topic/chat/${chatId}`, (msg) => {
        handleChatMessage(chatId, msg);
      });
      stompSubsRef.current.set(`chat:${chatId}`, sub);

      // Re-inscrever typing do mesmo chat
      if (typingListenersRef.current.has(chatId)) {
        const tsub = client.subscribe(`/topic/chat/${chatId}/typing`, (msg) => {
          handleTyping(chatId, msg);
        });
        stompSubsRef.current.set(`typing:${chatId}`, tsub);
      }
    }

    // Re-inscrever tópicos de alertas admin ativos
    for (const companyId of alertListenersRef.current.keys()) {
      const sub = client.subscribe(`/topic/admin/${companyId}/alerts`, (msg) => {
        handleAdminAlert(companyId, msg);
      });
      stompSubsRef.current.set(`alert:${companyId}`, sub);
    }

    for (const ticketId of ticketListenersRef.current.keys()) {
      const sub = client.subscribe(`/topic/ticket/${ticketId}/comments`, (msg) => {
        handleTicketComment(ticketId, msg);
      });
      stompSubsRef.current.set(`ticket:${ticketId}`, sub);
    }
  }

  function handleTyping(chatId: string, frame: IMessage) {
    try {
      const payload: TypingPayload = JSON.parse(frame.body);
      const listeners = typingListenersRef.current.get(chatId);
      if (listeners) {
        listeners.forEach((fn) => fn(payload));
      }
    } catch (e) {
      console.warn('[WS] Payload inválido no typing', chatId, e);
    }
  }

  function handleChatMessage(chatId: string, frame: IMessage) {
    try {
      const payload: WsMessage = JSON.parse(frame.body);
      const listeners = chatListenersRef.current.get(chatId);
      if (listeners) {
        listeners.forEach((fn) => fn(payload));
      }
    } catch (e) {
      console.warn('[WS] Payload inválido no chat', chatId, e);
    }
  }

  function handleAdminAlert(companyId: string, frame: IMessage) {
    try {
      const payload: WsErrorAlert = JSON.parse(frame.body);
      const listeners = alertListenersRef.current.get(companyId);
      if (listeners) {
        listeners.forEach((fn) => fn(payload));
      }
    } catch (e) {
      console.warn('[WS] Payload inválido no alerta admin', companyId, e);
    }
  }

  function handleTicketComment(ticketId: string, frame: IMessage) {
    try {
      const payload: WsTicketComment = JSON.parse(frame.body);
      const listeners = ticketListenersRef.current.get(ticketId);
      if (listeners) {
        listeners.forEach((fn) => fn(payload));
      }
    } catch (e) {
      console.warn('[WS] Payload inválido no ticket', ticketId, e);
    }
  }

  // Conecta quando o usuário fizer login
  useEffect(() => {
    if (profile && isOnline) {
      connect();
    } else {
      clientRef.current?.deactivate();
      clientRef.current = null;
      setIsConnected(false);
      stompSubsRef.current.clear();
    }
  }, [connect, isOnline, profile]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      clientRef.current?.deactivate();
    };
  }, []);

  // ── API pública ─────────────────────────────────────────────────────────────

  const subscribeChatMessages = useCallback((chatId: string, listener: MessageListener): (() => void) => {
    // Registrar listener
    if (!chatListenersRef.current.has(chatId)) {
      chatListenersRef.current.set(chatId, new Set());
    }
    chatListenersRef.current.get(chatId)!.add(listener);

    // Inscrever no STOMP se conectado (connected = STOMP CONNECTED frame recebido)
    const key = `chat:${chatId}`;
    if (clientRef.current?.connected && !stompSubsRef.current.has(key)) {
      try {
        const sub = clientRef.current.subscribe(`/topic/chat/${chatId}`, (msg) => {
          handleChatMessage(chatId, msg);
        });
        stompSubsRef.current.set(key, sub);
        console.log('[WS] ✓ Inscrito em /topic/chat/' + chatId);
      } catch (e) {
        console.warn('[WS] ✗ Erro ao inscrever em /topic/chat/' + chatId, e);
      }
    } else if (!clientRef.current?.connected) {
      console.warn('[WS] ⚠ STOMP ainda não conectado, subscription será registrada após onConnect');
    }

    // Retorna função de cleanup
    return () => {
      const set = chatListenersRef.current.get(chatId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          chatListenersRef.current.delete(chatId);
          // Cancelar subscription STOMP quando não houver mais listeners
          const sub = stompSubsRef.current.get(key);
          if (sub) {
            try { sub.unsubscribe(); } catch {}
            stompSubsRef.current.delete(key);
          }
        }
      }
    };
  }, []);

  const subscribeAdminAlerts = useCallback((companyId: string, listener: AlertListener): (() => void) => {
    if (!alertListenersRef.current.has(companyId)) {
      alertListenersRef.current.set(companyId, new Set());
    }
    alertListenersRef.current.get(companyId)!.add(listener);

    const key = `alert:${companyId}`;
    if (clientRef.current?.connected && !stompSubsRef.current.has(key)) {
      try {
        const sub = clientRef.current.subscribe(`/topic/admin/${companyId}/alerts`, (msg) => {
          handleAdminAlert(companyId, msg);
        });
        stompSubsRef.current.set(key, sub);
        console.log('[WS] ✓ Inscrito em /topic/admin/' + companyId + '/alerts');
      } catch (e) {
        console.warn('[WS] ✗ Erro ao inscrever em /topic/admin/' + companyId + '/alerts', e);
      }
    } else if (!clientRef.current?.connected) {
      console.warn('[WS] ⚠ STOMP ainda não conectado para alertas, subscription será registrada após onConnect');
    }

    return () => {
      const set = alertListenersRef.current.get(companyId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          alertListenersRef.current.delete(companyId);
          const sub = stompSubsRef.current.get(key);
          if (sub) {
            try { sub.unsubscribe(); } catch {}
            stompSubsRef.current.delete(key);
          }
        }
      }
    };
  }, []);

  const subscribeTicketComments = useCallback((ticketId: string, listener: TicketCommentListener): (() => void) => {
    if (!ticketListenersRef.current.has(ticketId)) {
      ticketListenersRef.current.set(ticketId, new Set());
    }
    ticketListenersRef.current.get(ticketId)!.add(listener);

    const key = `ticket:${ticketId}`;
    if (clientRef.current?.connected && !stompSubsRef.current.has(key)) {
      try {
        const sub = clientRef.current.subscribe(`/topic/ticket/${ticketId}/comments`, (msg) => {
          handleTicketComment(ticketId, msg);
        });
        stompSubsRef.current.set(key, sub);
        console.log('[WS] ✓ Inscrito em /topic/ticket/' + ticketId + '/comments');
      } catch (e) {
        console.warn('[WS] ✗ Erro ao inscrever em /topic/ticket/' + ticketId + '/comments', e);
      }
    } else if (!clientRef.current?.connected) {
      console.warn('[WS] ⚠ STOMP ainda não conectado para tickets, subscription será registrada após onConnect');
    }

    return () => {
      const set = ticketListenersRef.current.get(ticketId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          ticketListenersRef.current.delete(ticketId);
          const sub = stompSubsRef.current.get(key);
          if (sub) {
            try { sub.unsubscribe(); } catch {}
            stompSubsRef.current.delete(key);
          }
        }
      }
    };
  }, []);

  const subscribeChatTyping = useCallback((chatId: string, listener: TypingListener): (() => void) => {
    if (!typingListenersRef.current.has(chatId)) {
      typingListenersRef.current.set(chatId, new Set());
    }
    typingListenersRef.current.get(chatId)!.add(listener);

    const key = `typing:${chatId}`;
    if (clientRef.current?.connected && !stompSubsRef.current.has(key)) {
      try {
        const sub = clientRef.current.subscribe(`/topic/chat/${chatId}/typing`, (msg) => {
          handleTyping(chatId, msg);
        });
        stompSubsRef.current.set(key, sub);
      } catch (e) {
        console.warn('[WS] Erro ao inscrever typing', chatId, e);
      }
    }

    return () => {
      const set = typingListenersRef.current.get(chatId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          typingListenersRef.current.delete(chatId);
          const sub = stompSubsRef.current.get(key);
          if (sub) {
            try { sub.unsubscribe(); } catch {}
            stompSubsRef.current.delete(key);
          }
        }
      }
    };
  }, []);

  const sendTypingWs = useCallback((chatId: string, isTyping: boolean): void => {
    if (!clientRef.current?.connected) return;
    try {
      clientRef.current.publish({
        destination: `/app/chat/${chatId}/typing`,
        body: JSON.stringify({ typing: isTyping }),
      });
    } catch (e) {
      // silencioso — typing não é crítico
    }
  }, []);

  const sendMessageWs = useCallback((
    chatId: string,
    content: string,
    messageType = 'text',
    mediaUrl?: string,
    mediaName?: string,
    clientMessageId?: string,
  ): boolean => {
    if (!clientRef.current?.connected) return false;
    try {
      clientRef.current.publish({
        destination: `/app/chat/${chatId}/send`,
        body: JSON.stringify({
          content,
          message_type: messageType,
          media_url: mediaUrl,
          media_name: mediaName,
          client_message_id: clientMessageId,
        }),
      });
      return true;
    } catch (e) {
      console.warn('[WS] Falha ao enviar mensagem:', e);
      return false;
    }
  }, []);

  return (
    <WebSocketContext.Provider value={{
      isConnected,
      subscribeChatMessages,
      subscribeAdminAlerts,
      subscribeTicketComments,
      subscribeChatTyping,
      sendMessageWs,
      sendTypingWs,
    }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWebSocket deve ser usado dentro de WebSocketProvider');
  return ctx;
}
