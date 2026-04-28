import { supabase } from './supabaseClient';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://kanux-mobile-web.onrender.com';

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || `Erro ${response.status}`);
  }
  return data;
}

const apiClient = {
  // Profile
  async getProfile() {
    return apiRequest('/api/profile');
  },

  // Companies
  async getCompanies() {
    return apiRequest('/api/companies');
  },

  async getAllCompanies() {
    return apiRequest('/api/admin/companies');
  },

  async createCompany(name: string, slug: string) {
    return apiRequest('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name, slug }),
    });
  },

  // Company members
  async getCompanyMembers(companyId: string) {
    return apiRequest(`/api/companies/${companyId}/members`);
  },

  async getMembers(companyId?: string) {
    const query = companyId ? `?companyId=${companyId}` : '';
    return apiRequest(`/api/admin/members${query}`);
  },

  async addMember(companyId: string, userProfileId: string, role = 'MEMBER') {
    return apiRequest('/api/admin/members', {
      method: 'POST',
      body: JSON.stringify({ company_id: companyId, user_profile_id: userProfileId, role }),
    });
  },

  async updateMember(memberId: string, role: string) {
    return apiRequest('/api/admin/members', {
      method: 'PUT',
      body: JSON.stringify({ id: memberId, role }),
    });
  },

  async removeMember(memberId: string) {
    return apiRequest(`/api/admin/members?id=${memberId}`, { method: 'DELETE' });
  },

  // Chats
  async getChats(companyId?: string, chatId?: string) {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId);
    if (chatId) params.append('chatId', chatId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/api/chats${query}`);
  },

  async getCompanyChats(companyId: string) {
    return this.getChats(companyId);
  },

  async getChatMessages(chatId: string) {
    return apiRequest(`/api/chats/${chatId}/messages`);
  },

  async createChat(companyId: string, name: string, isPrivate: boolean = false, departmentId?: string) {
    return apiRequest('/api/chats', {
      method: 'POST',
      body: JSON.stringify({ type: 'chat', companyId, name, isPrivate, departmentId }),
    });
  },

  async sendMessage(
    chatId: string,
    content: string,
    userProfileId?: string,
    options?: { messageType?: string; mediaUrl?: string; mediaName?: string }
  ) {
    return apiRequest(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        user_profile_id: userProfileId,
        message_type: options?.messageType ?? 'text',
        media_url: options?.mediaUrl,
        media_name: options?.mediaName,
      }),
    });
  },

  // Tickets
  async getTickets(companyId?: string, ticketId?: string) {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId);
    if (ticketId) params.append('ticketId', ticketId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/api/tickets${query}`);
  },

  async createTicket(data: any) {
    return apiRequest('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTicket(data: any) {
    return apiRequest('/api/tickets', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getTicketComments(ticketId: string) {
    return apiRequest(`/api/tickets/${ticketId}/comments`);
  },

  async addTicketComment(ticketId: string, content: string) {
    return apiRequest(`/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  // Departments
  async getDepartments(companyId?: string) {
    const query = companyId ? `?companyId=${companyId}` : '';
    return apiRequest(`/api/departments${query}`);
  },

  async createDepartment(companyId: string, name: string) {
    return apiRequest('/api/departments', {
      method: 'POST',
      body: JSON.stringify({ companyId, name }),
    });
  },

  // Admin actions
  async inviteUser(email: string, companyId: string, role: string = 'MEMBER', displayName?: string) {
    return apiRequest('/api/admin/invite-user', {
      method: 'POST',
      body: JSON.stringify({ email, company_id: companyId, role, display_name: displayName }),
    });
  },
};

export default apiClient;

