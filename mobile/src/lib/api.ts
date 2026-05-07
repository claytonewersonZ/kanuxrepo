// Cache for the detected API URL
let cachedApiUrl: string | null = null;
let detectionPromise: Promise<string> | null = null;

const detectApiUrl = async (): Promise<string> => {
  if (cachedApiUrl) return cachedApiUrl;
  if (detectionPromise) return detectionPromise;

  detectionPromise = (async () => {
    console.log('🔍 Auto-detecting Java Backend API server...');

    // URLs to try in order of preference (produção primeiro!)
    const urlsToTry = [
      'https://kanux-mobile-web.onrender.com',
      'http://10.0.2.2:10000',
      'http://localhost:10000',
    ];

    for (const url of urlsToTry) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(`${url}/api/verify-company`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: 'test' }),
          signal: controller.signal as any,
        });

        clearTimeout(timeoutId);

        const text = await response.text();
        if (text.includes('success') || text.includes('error') || text.includes('company')) {
          cachedApiUrl = url;
          console.log(`✅ Backend detectado: ${url}`);
          detectionPromise = null;
          return url;
        }
      } catch {
        console.log(`❌ Backend indisponível: ${url}`);
      }
    }

    console.warn('⚠️ Sem backend detectado, usando produção');
    cachedApiUrl = 'https://kanux-mobile-web.onrender.com';
    detectionPromise = null;
    return cachedApiUrl;
  })();

  return detectionPromise;
};

// Get API URL sync
export const getApiUrl = (): string => {
  if (cachedApiUrl) return cachedApiUrl;
  cachedApiUrl = 'https://kanux-mobile-web.onrender.com';
  return cachedApiUrl;
};

// Initialize (async preferred) — call once on app start
export const initApi = async (): Promise<string> => {
  if (cachedApiUrl) return cachedApiUrl;
  try {
    const { default: Constants } = await import('expo-constants');
    const configUrl = Constants?.expoConfig?.extra?.apiUrl ||
                      Constants?.manifest?.extra?.apiUrl ||
                      Constants?.extra?.apiUrl;
    if (configUrl && typeof configUrl === 'string') {
      cachedApiUrl = configUrl;
      console.log(`✅ API config: ${configUrl}`);
      return configUrl;
    }
  } catch {}
  return detectApiUrl();
};

export const getApiUrlSync = getApiUrl;

// Token storage
let authToken: string | null = null;

// Optional async token provider — registered by AuthContext to return a fresh token before each request
let tokenProvider: (() => Promise<string | null>) | null = null;

export const setAuthToken = (token: string | null) => { authToken = token; };
export const getAuthToken = (): string | null => authToken;

/**
 * Register an async function that returns the current fresh access token.
 * Called before every authenticated request to ensure the token is never stale.
 */
export const setTokenProvider = (fn: () => Promise<string | null>) => { tokenProvider = fn; };

const getHeaders = (token: string | null, requiresAuth = true): Record<string, string> => {
  if (requiresAuth && !token) {
    console.warn('⚠️ API call requires auth but no token available!');
  }
  return {
    'Content-Type': 'application/json',
    ...(requiresAuth && token && { Authorization: `Bearer ${token}` }),
  };
};

// Generic API request (resolve base URL at request time to allow detection/init)
async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}, requiresAuth = true): Promise<T> {
  const base = await initApi();

  // Resolve the freshest token available before every request
  let currentToken = authToken;
  if (requiresAuth && tokenProvider) {
    try {
      const fresh = await tokenProvider();
      if (fresh) {
        currentToken = fresh;
        authToken = fresh; // keep in sync
      }
    } catch {
      // Fall back to cached token
    }
  }

  const headers = { ...getHeaders(currentToken, requiresAuth), ...options.headers };
  
  console.log(`📡 API ${options.method || 'GET'} ${endpoint} | auth=${!!currentToken} | token=${currentToken ? currentToken.substring(0, 20) + '...' : 'null'}`);

  // Timeout de 12s — evita travar durante cold-start do Render
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  
  let response: Response;
  try {
    response = await fetch(`${base}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal as any,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  // Read body as text first to handle empty or non-JSON responses safely
  const text = await response.text();

  if (!text || text.trim() === '') {
    if (!response.ok) {
      // Debug 401: send token to public debug endpoint
      if (response.status === 401 && currentToken) {
        debugJwt(base, currentToken);
      }
      throw new Error(`Erro HTTP ${response.status}`);
    }
    return {} as T;
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    if (!response.ok) {
      throw new Error(`Erro HTTP ${response.status}`);
    }
    throw new Error(`Resposta inválida do servidor`);
  }

  if (!response.ok) {
    // Debug 401: send token to public debug endpoint
    if (response.status === 401 && currentToken) {
      debugJwt(base, currentToken);
    }
    throw new Error(data?.error || data?.message || `Erro HTTP ${response.status}`);
  }

  return data;
}

// One-shot debug: validate token via public endpoint (non-blocking)
let _debugDone = false;
function debugJwt(base: string, token: string) {
  if (_debugDone) return;
  _debugDone = true;
  fetch(`${base}/api/debug/jwt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
    .then(r => r.text())
    .then(t => console.error('🔑 JWT DEBUG RESULT:', t))
    .catch(e => console.error('🔑 JWT DEBUG ERROR:', e));
}

export const api = {
  baseUrl: getApiUrlSync(),
  
  // Auth
  async login(email: string, password: string) {
    const result = await apiRequest<{ success: boolean; data?: { token: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, false);
    
    if (result.success && result.data?.token) setAuthToken(result.data.token);
    return result;
  },

  // Profile
  async getProfile() { return apiRequest('/api/profile'); },
  async updateProfile(data: { display_name?: string; phone?: string; position?: string; department?: string; avatar_url?: string }) {
    return apiRequest('/api/profile', { method: 'PATCH', body: JSON.stringify(data) });
  },
  async savePushToken(pushToken: string) {
    return apiRequest('/api/profile/push-token', {
      method: 'POST',
      body: JSON.stringify({ push_token: pushToken }),
    });
  },

  async getOnlineMembers(chatId: string): Promise<string[]> {
    const result = await apiRequest(`/api/chats/${chatId}/online-members`);
    return (result?.data as string[]) ?? [];
  },

  // Companies
  async getUserCompanies() { return apiRequest('/api/companies'); },
  async getCompanies() { return apiRequest('/api/companies'); },
  async getAllCompanies() { return apiRequest('/api/admin/companies'); },
  async getCompanyMembers(companyId: string) { return apiRequest(`/api/companies/${companyId}/members`); },
  async getSyncBootstrap(messagesPerChat = 50) {
    return apiRequest(`/api/sync/bootstrap?messagesPerChat=${messagesPerChat}`);
  },

  async createCompany(name: string, slug: string) {
    return apiRequest('/api/companies', {
      method: 'POST',
      body: JSON.stringify({ name, slug }),
    });
  },

  // Members
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

  async updateMember(id: string, role: string) {
    return apiRequest('/api/admin/members', {
      method: 'PUT',
      body: JSON.stringify({ id, role }),
    });
  },

  async removeMember(id: string) {
    return apiRequest(`/api/admin/members?id=${id}`, { method: 'DELETE' });
  },

  // Tickets
  async getTickets(companyId?: string, ticketId?: string) {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId);
    if (ticketId) params.append('ticketId', ticketId);
    return apiRequest(`/api/tickets?${params}`);
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

  async deleteTicket(id: string) {
    return apiRequest(`/api/tickets?id=${id}`, { method: 'DELETE' });
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

  // Chats
  async getChats(companyId?: string, chatId?: string) {
    const params = new URLSearchParams();
    if (companyId) params.set('companyId', companyId);
    if (chatId) params.set('chatId', chatId);
    const q = params.toString();
    return apiRequest(`/api/chats${q ? `?${q}` : ''}`);
  },

  async getMessages(chatId: string) {
    return apiRequest(`/api/chats/${chatId}/messages`);
  },

  async createChat(data: any) {
    return apiRequest('/api/chats', { method: 'POST', body: JSON.stringify(data) });
  },

  async setTyping(chatId: string, typing: boolean) {
    return apiRequest(`/api/chats/${chatId}/typing`, {
      method: 'POST',
      body: JSON.stringify({ typing }),
    });
  },

  async getTyping(chatId: string) {
    return apiRequest(`/api/chats/${chatId}/typing`, { method: 'GET' });
  },

  async sendMessage(
    chatId: string,
    content: string,
    userProfileId: string,
    options?: { messageType?: string; mediaUrl?: string; mediaName?: string; clientMessageId?: string }
  ) {
    return apiRequest(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        user_profile_id: userProfileId,
        message_type: options?.messageType ?? 'text',
        media_url: options?.mediaUrl,
        media_name: options?.mediaName,
        client_message_id: options?.clientMessageId,
      }),
    });
  },

  async deleteChat(id: string) {
    return apiRequest(`/api/chats?id=${id}`, { method: 'DELETE' });
  },

  // Membros do Chat
  async getChatMembers(chatId: string) {
    return apiRequest(`/api/chats/${chatId}/members`);
  },

  async addChatMember(chatId: string, userProfileId: string, role = 'MEMBER') {
    return apiRequest(`/api/chats/${chatId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_profile_id: userProfileId, role }),
    });
  },

  async removeChatMember(chatId: string, userProfileId: string) {
    return apiRequest(`/api/chats/${chatId}/members/${userProfileId}`, { method: 'DELETE' });
  },

  // Departamentos
  async getDepartments(companyId: string) {
    return apiRequest(`/api/departments?companyId=${companyId}`);
  },

  async createDepartment(companyId: string, name: string) {
    return apiRequest('/api/departments', {
      method: 'POST',
      body: JSON.stringify({ companyId, name }),
    });
  },

  async deleteDepartment(id: string) {
    return apiRequest(`/api/departments?id=${id}`, { method: 'DELETE' });
  },

  // Membros do Departamento
  async getDeptMembers(departmentId: string) {
    return apiRequest(`/api/departments/${departmentId}/members`);
  },

  async addDeptMember(departmentId: string, userProfileId: string) {
    return apiRequest(`/api/departments/${departmentId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_profile_id: userProfileId }),
    });
  },

  async removeDeptMember(departmentId: string, userProfileId: string) {
    return apiRequest(`/api/departments/${departmentId}/members/${userProfileId}`, { method: 'DELETE' });
  },

  // Admin - criar usuário com senha
  async adminCreateUser(data: { email: string; password: string; display_name: string; position?: string; company_id: string; role: string; screen_permissions?: string }) {
    return apiRequest('/api/admin/create-user', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Admin - editar usuário
  async adminUpdateUser(profileId: string, data: {
    display_name?: string; email?: string; position?: string; phone?: string;
    password?: string; role?: string; company_id?: string; is_super_admin?: string;
    work_start_time?: string; work_end_time?: string;
  }) {
    return apiRequest(`/api/admin/users/${profileId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Admin - listar todos os usuários
  async adminGetUsers() {
    return apiRequest('/api/admin/users');
  },

  // Admin - dashboard e logs de atividade por empresa
  async getAdminDashboard(companyId: string) {
    return apiRequest(`/api/admin/dashboard?companyId=${encodeURIComponent(companyId)}`);
  },

  // Admin - atualizar chat
  async updateChat(chatId: string, data: { name?: string; only_admins_send?: boolean }) {
    return apiRequest(`/api/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Verificar empresa (sem auth)
  async verifyCompany(slug: string) {
    return apiRequest('/api/verify-company', {
      method: 'POST',
      body: JSON.stringify({ slug }),
    }, false);
  },

  logout() {
    setAuthToken(null);
  },
};

