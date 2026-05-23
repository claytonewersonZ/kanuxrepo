import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useWebSocket } from './WebSocketContext';
import { useAuth } from './AuthContext';
import { 
  getPendingMessages, 
  replacePendingMessages,
  getOfflineMessages,
  saveMessagesOffline,
  addPendingMessage,
  getPendingTickets,
  addPendingTicket,
  saveCompaniesOffline,
  saveChatsOffline,
  saveDepartmentsOffline,
  saveTicketsOffline,
  updateLastSync,
  getLastSync,
  replacePendingTickets,
} from '../lib/offlineStorage';
import {
  getChatMessages,
  getCompanyChats,
  getCompanyTickets,
  getDepartments,
  getUserCompanies,
  sendMessage as sendApiMessage,
  createTicket as sendApiCreateTicket,
} from '../lib/supabase';
import { api } from '../lib/api';

interface SyncContextType {
  isSyncing: boolean;
  pendingCount: number;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { isOnline, profile } = useAuth();
  const ws = useWebSocket();
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Check pending count periodically
  useEffect(() => {
    const checkPending = async () => {
      const pending = await getPendingMessages();
      setPendingCount(pending.length);
    };

    checkPending();
    const interval = setInterval(checkPending, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-sync when coming online
  useEffect(() => {
    if (!isOnline || !profile) return;
    (async () => {
      // Se acabou de fazer preload no login, evita repetir o sync pesado imediatamente.
      const lastSync = await getLastSync();
      const justSynced = lastSync && (Date.now() - lastSync.getTime()) < 60_000;
      if (!justSynced) await syncNow();
    })();
  }, [isOnline, profile?.id]);

  const warmupOfflineData = async () => {
    try {
      // Primeira opção: endpoint de bootstrap no backend para sincronizar tudo de uma vez.
      try {
        const bootstrapResult: any = await api.getSyncBootstrap(50);
        const bundles = bootstrapResult?.data?.companies || [];

        if (Array.isArray(bundles) && bundles.length > 0) {
          const companies = bundles
            .map((b: any) => b?.company)
            .filter(Boolean);

          await saveCompaniesOffline(companies);

          for (const bundle of bundles) {
            const company = bundle?.company;
            if (!company?.id) continue;

            const chats = bundle?.chats || [];
            const tickets = bundle?.tickets || [];
            const departments = bundle?.departments || [];
            const messagesByChat = bundle?.messages_by_chat || {};

            await Promise.all([
              saveTicketsOffline(tickets, company.id),
              saveChatsOffline(company.id, chats),
              saveDepartmentsOffline(company.id, departments),
            ]);

            await Promise.all(
              chats.map(async (chat: any) => {
                const messages = messagesByChat?.[chat.id] || [];
                await saveMessagesOffline(chat.id, messages);
              })
            );
          }

          await updateLastSync();
          return;
        }
      } catch {
        // Fallback abaixo mantém compatibilidade com backend antigo.
      }

      // Fallback: sincronização tradicional por múltiplos endpoints.
      const companies = await getUserCompanies();
      await saveCompaniesOffline(companies);

      for (const company of companies) {
        const [tickets, chats, departments] = await Promise.all([
          getCompanyTickets(company.id),
          getCompanyChats(company.id),
          getDepartments(company.id),
        ]);

        await Promise.all([
          saveTicketsOffline(tickets, company.id),
          saveChatsOffline(company.id, chats),
          saveDepartmentsOffline(company.id, departments),
        ]);

        await Promise.all(
          chats.map(async (chat) => {
            const messages = await getChatMessages(chat.id);
            await saveMessagesOffline(chat.id, messages);
          })
        );
      }

      await updateLastSync();
    } catch (error) {
      console.error('Error warming up offline data:', error);
    }
  };

  const syncNow = async () => {
    if (!isOnline || isSyncing || !profile) return;
    setIsSyncing(true);
    try {
      // Mensagens
      const pending = await getPendingMessages();
      const failed: any[] = [];

      for (const message of pending) {
        try {
          const safeOptions = {
            ...(message.options || {}),
            clientMessageId: message.options?.clientMessageId
              || `${message.chatId}:${new Date(message.createdAt || Date.now()).getTime()}:${Math.random().toString(36).slice(2, 10)}`,
          };

          let sent = false;
          if (ws?.isConnected && ws.sendMessageWs) {
            sent = ws.sendMessageWs(
              message.chatId,
              message.content,
              safeOptions.messageType,
              safeOptions.mediaUrl,
              safeOptions.mediaName,
              safeOptions.clientMessageId
            );
          }
          if (!sent) {
            try {
              const apiSent = await sendApiMessage(message.chatId, message.content, safeOptions);
              sent = !!apiSent;
            } catch (e) {
              sent = false;
            }
          }
          if (!sent) {
            failed.push({ ...message, options: safeOptions });
          }
        } catch (error) {
          console.error('Error syncing message:', error);
          failed.push(message);
        }
      }
      await replacePendingMessages(failed);
      setPendingCount(failed.length);

      // Tickets
      const pendingTickets = await getPendingTickets();
      const failedTickets: any[] = [];
      for (const ticket of pendingTickets) {
        try {
          let sent = false;
          if (ws?.isConnected && ws.createTicketWs) {
            sent = ws.createTicketWs(ticket, () => {});
          }
          if (!sent) {
            try {
              // Ajuste os campos conforme a assinatura real de createTicket
              const apiSent = await sendApiCreateTicket(
                ticket.title,
                ticket.description,
                ticket.company_id,
                ticket.department_id,
                ticket.priority || 'LOW'
              );
              sent = !!apiSent;
            } catch (e) {
              sent = false;
            }
          }
          if (!sent) {
            failedTickets.push(ticket);
          }
        } catch (error) {
          console.error('Error syncing ticket:', error);
          failedTickets.push(ticket);
        }
      }
      await replacePendingTickets(failedTickets);

      // Comentários de ticket (exemplo: se implementar addPendingTicketComment)
      // ...

      await warmupOfflineData();
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <SyncContext.Provider value={{ isSyncing, pendingCount, syncNow }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}

// Hook to save messages offline and sync when online
export function useOfflineMessages(chatId: string) {
  const { isOnline, profile } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMessages = async () => {
    setLoading(true);
    try {
      if (isOnline) {
        const onlineMessages = await getChatMessages(chatId);
        setMessages(onlineMessages);
        await saveMessagesOffline(chatId, onlineMessages);
      } else {
        // Load from offline storage
        const offlineMessages = await getOfflineMessages(chatId);
        setMessages(offlineMessages);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      // Fallback to offline
      const offlineMessages = await getOfflineMessages(chatId);
      setMessages(offlineMessages);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (
    content: string,
    options?: { messageType?: string; mediaUrl?: string; mediaName?: string; clientMessageId?: string }
  ) => {
    const clientMessageId = options?.clientMessageId || `${chatId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const resolvedOptions = { ...(options || {}), clientMessageId };

    if (isOnline) {
      // Send directly
      const message = await sendApiMessage(chatId, content, resolvedOptions);
      if (message) {
        setMessages(prev => [...prev, message]);
      }
      return message;
    } else {
      // Save locally and queue for sync
      const tempMessage = {
        id: `temp_${Date.now()}`,
        chat_id: chatId,
        user_profile_id: profile?.id,
        content,
        message_type: resolvedOptions.messageType ?? 'text',
        media_url: resolvedOptions.mediaUrl,
        media_name: resolvedOptions.mediaName,
        client_message_id: clientMessageId,
        attachments: [],
        created_at: new Date().toISOString(),
        pending: true,
      };
      
      setMessages(prev => [...prev, tempMessage]);
      await addPendingMessage({
        chatId,
        content,
        options: resolvedOptions,
        createdAt: tempMessage.created_at,
      });
      return tempMessage;
    }
  };

  useEffect(() => {
    loadMessages();
  }, [chatId, isOnline]);

  return { messages, loading, sendMessage, refresh: loadMessages };
}

