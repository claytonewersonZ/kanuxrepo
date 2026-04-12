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
      headers: {
        'Content-Type': 'application/json',
      },
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
  is_super_admin: boolean;
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
  role: 'MEMBER' | 'MANAGER' | 'ADMIN';
  joined_at: string;
};

export type Chat = {
  id: string;
  company_id: string;
  department_id: string | null;
  name: string;
  is_private: boolean;
  created_by: string | null;
  created_at: string;
};

export type Message = {
  id: string;
  chat_id: string;
  user_profile_id: string;
  content: string;
  attachments: any;
  created_at: string;
  updated_at: string;
};

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
    return result.data || null;
  } catch (error) {
    console.error('Error fetching profile via API:', error);
    return null;
  }
}

// Helper to get user's companies
export async function getUserCompanies(): Promise<Company[]> {
  try {
    const result = await api.getUserCompanies();
    return result.data || [];
  } catch (error) {
    console.error('Error fetching companies via API:', error);
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

// Helper to get chats for a company
export async function getCompanyChats(companyId: string): Promise<Chat[]> {
  try {
    const result = await api.getChats(companyId);
    return result.data || [];
  } catch (error) {
    console.error('Error fetching chats:', error);
    return [];
  }
}

// Helper to get messages for a chat
export async function getChatMessages(chatId: string, limit = 50): Promise<Message[]> {
  try {
    const result = await api.getMessages(chatId);
    return (result.data || []).reverse();
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
}

// Helper to send a message
export async function sendMessage(chatId: string, content: string): Promise<Message | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await getUserProfile(user.id);
  if (!profile) return null;

  try {
    const result = await api.sendMessage(chatId, content, profile.id);
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

// Helper to sign out
export async function signOut() {
  const { error } = await (supabase.auth as any).signOut();
  if (error) {
    console.error('Error signing out:', error);
  }
}
