import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import { ENV } from './env';
import { api } from './api';

// Create Supabase client with React Native compatibility
export const supabase = createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: {
      headers: {},
    },
  }
);

// Types for the database schema
export type Profile = {
  id: string;
  auth_user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  phone: string | null;
  position: string | null;
  is_super_admin: boolean;
  work_start_time?: string | null;
  work_end_time?: string | null;
  created_at: string;
};

export type Company = {
  id: string;
  name: string;
  slug: string;
  company_number: number;
  created_by: string | null;
  created_at: string;
};

export type CompanyMember = {
  id: string;
  company_id: string;
  user_profile_id: string;
  role: 'MEMBER' | 'MANAGER' | 'ADMIN' | 'SUPER_ADMIN';
  joined_at: string;
};


// Definição única de Ticket


export type Ticket = {
  id: string;
  number: string;
  company_id: string;
  department_id: string | null;
  creator_profile_id: string;
  assignee_profile_id: string | null;
  title: string;
  description: string | null;
  status: 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  department_name?: string | null;
};

export type TicketComment = {
  id: string;
  ticket_id: string;
  user_profile_id: string;
  content: string;
  created_at: string;
};

export type Department = {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  created_at: string;
};

export type ChatMember = {
  id: string;
  chat_id: string;
  user_profile_id: string;
  role: string;
  joined_at: string;
  user_profile?: {
    id: string;
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
};

// Typing indicator helpers
export async function setChatTyping(chatId: string, typing: boolean): Promise<any> {
  try {
    const result = await api.setTyping(chatId, typing);
    return result;
  } catch (error) {
    console.error('Error setting typing status via API:', error);
    return null;
  }
}

export async function getChatTyping(chatId: string): Promise<any[]> {
  try {
    const result = await api.getTyping(chatId);
    return result.data || [];
  } catch (error) {
    console.error('Error fetching typing status via API:', error);
    return [];
  }
}

// Helper to get current user
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// Helper to get user profile
export async function getUserProfile(userId?: string): Promise<Profile | null> {
  try {
    const result = await api.getProfile();
    const p = result.data;
    if (!p) return null;
    // Backend Java returns camelCase; normalize to mobile snake_case contract.
    return {
      id: p.id,
      auth_user_id: p.auth_user_id ?? p.authUserId ?? p.id,
      display_name: p.display_name ?? p.displayName ?? null,
      email: p.email ?? null,
      avatar_url: p.avatar_url ?? p.avatarUrl ?? null,
      is_super_admin: p.is_super_admin ?? p.superAdmin ?? false,
      created_at: p.created_at ?? p.createdAt ?? new Date().toISOString(),
      phone: p.phone ?? null,
      position: p.position ?? null,
      work_start_time: p.work_start_time ?? p.workStartTime ?? null,
      work_end_time: p.work_end_time ?? p.workEndTime ?? null,
    };
  } catch (error) {
    console.error('Error fetching profile via API:', error);

    // Fallback: build minimal profile directly from Supabase Auth session
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        console.warn('⚠️ Using Supabase Auth fallback profile (backend unavailable)');
        return {
          id: user.id,
          auth_user_id: user.id,
          display_name: user.user_metadata?.full_name
            || user.user_metadata?.name
            || user.user_metadata?.display_name
            || user.email?.split('@')[0]
            || null,
          email: user.email || null,
          avatar_url: user.user_metadata?.avatar_url || null,
          is_super_admin: false,
          created_at: user.created_at,
          phone: null,
          position: null,
          work_start_time: null,
          work_end_time: null,
        };
      }
    } catch (fallbackError) {
      console.error('Supabase Auth fallback failed:', fallbackError);
    }
    return null;
  }
}

// Helper to get user's companies
export async function getUserCompanies(): Promise<Company[]> {
  try {
    const result = await api.getUserCompanies();
    const items = result.data || [];
    return items.map((c: any) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      company_number: c.company_number ?? c.companyNumber ?? 0,
      created_by: c.created_by ?? c.createdBy ?? null,
      created_at: c.created_at ?? c.createdAt ?? new Date().toISOString(),
    }));
  } catch (error) {
    console.error('Error fetching companies via API:', error);
    // Return empty array — user will see company selection screen
    return [];
  }
}

// Helper to get company members
export async function getCompanyMembers(companyId: string): Promise<(Profile & { role: string })[]> {
  try {
    const result = await api.getCompanyMembers(companyId);
    return result.data || [];
  } catch (error) {
    console.error('Error fetching members via API:', error);
    return [];
  }
}

// Definição de Chat
export type Chat = {
  id: string;
  company_id: string;
  department_id?: string | null;
  name: string;
  private_chat: boolean;
  only_admins_send: boolean;
  created_by: string;
  created_at: string;
  updated_at?: string;
  is_private?: boolean; // compatibilidade para uso no ChatScreen
};

export async function getCompanyChats(companyId: string): Promise<Chat[]> {
  try {
    const result = await api.getChats(companyId);
    return result.data || [];
  } catch (error) {
    console.error('Error fetching chats:', error);
    return [];
  }
}

// Definição de Message
export type Message = {
  id: string;
  chat_id: string;
  user_profile_id: string;
  content: string;
  message_type: string;
  media_url?: string;
  media_name?: string;
  client_message_id?: string;
  attachments: string;
  created_at: string;
  updated_at?: string;
};

export async function getChatMessages(chatId: string, limit = 50): Promise<Message[]> {
  try {
    const result = await api.getMessages(chatId);
    return result.data || [];
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
}

// Helper to send a message (texto ou mídia)
export async function sendMessage(
  chatId: string,
  content: string,
  options?: { messageType?: string; mediaUrl?: string; mediaName?: string; clientMessageId?: string }
): Promise<Message | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await getUserProfile(user.id);
  if (!profile) return null;

  try {
    const result = await api.sendMessage(chatId, content, profile.id, options);
    return result.data || null;
  } catch (error) {
    console.error('Error sending message:', error);
    return null;
  }
}

// Helper to get tickets for a company
export async function getCompanyTickets(companyId: string): Promise<Ticket[]> {
  try {
    const result = await api.getTickets(companyId);
    return result.data || [];
  } catch (error) {
    console.error('Error fetching tickets:', error);
    return [];
  }
}

// Helper to create a ticket
export async function createTicket(
  companyId: string,
  title: string,
  description: string,
  priority: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM',
  departmentId?: string
): Promise<Ticket | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await getUserProfile(user.id);
  if (!profile) return null;

  try {
    const result = await api.createTicket({
      companyId,
      departmentId,
      creatorProfileId: profile.id,
      title,
      description,
      priority,
    });
    return result.data || null;
  } catch (error) {
    console.error('Error creating ticket:', error);
    return null;
  }
}

// Helper to update ticket status
export async function updateTicketStatus(
  ticketId: string,
  status: 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED'
): Promise<Ticket | null> {
  try {
    const result = await api.updateTicket({
      id: ticketId,
      status,
    });
    return result.data || null;
  } catch (error) {
    console.error('Error updating ticket:', error);
    return null;
  }
}

// Helper to get ticket comments
export async function getTicketComments(ticketId: string): Promise<TicketComment[]> {
  try {
    const result = await api.getTicketComments(ticketId);
    return result.data || [];
  } catch (error) {
    console.error('Error fetching comments via API:', error);
    return [];
  }
}

// Helper to add ticket comment
export async function addTicketComment(ticketId: string, content: string): Promise<TicketComment | null> {
  try {
    const result = await api.addTicketComment(ticketId, content);
    return result.data || null;
  } catch (error) {
    console.error('Error adding comment via API:', error);
    return null;
  }
}

// Buscar membros de um chat
export async function getChatMembersForChat(chatId: string): Promise<ChatMember[]> {
  try {
    const result = await api.getChatMembers(chatId);
    return result.data || [];
  } catch (error) {
    console.error('Erro ao buscar membros do chat:', error);
    return [];
  }
}

// Adicionar membro ao chat
export async function addMemberToChat(chatId: string, userProfileId: string): Promise<ChatMember | null> {
  try {
    const result = await api.addChatMember(chatId, userProfileId);
    return result.data || null;
  } catch (error) {
    console.error('Erro ao adicionar membro ao chat:', error);
    return null;
  }
}

// Remover membro do chat
export async function removeMemberFromChat(chatId: string, userProfileId: string): Promise<boolean> {
  try {
    await api.removeChatMember(chatId, userProfileId);
    return true;
  } catch (error) {
    console.error('Erro ao remover membro do chat:', error);
    return false;
  }
}

// Buscar departamentos de uma empresa
export async function getDepartments(companyId: string): Promise<Department[]> {
  try {
    const result = await api.getDepartments(companyId);
    return result.data || [];
  } catch (error) {
    console.error('Erro ao buscar departamentos:', error);
    return [];
  }
}

// Helper to sign out
export async function signOut() {
  const { error } = await (supabase.auth as any).signOut();
  if (error) {
    console.error('Error signing out:', error);
  }
}
