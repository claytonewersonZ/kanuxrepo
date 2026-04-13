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
      'https://kanux-mobile-web-production.up.railway.app',
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
          signal: controller.signal,
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
    cachedApiUrl = 'https://kanux-mobile-web-production.up.railway.app';
    detectionPromise = null;
    return cachedApiUrl;
  })();

  return detectionPromise;
};

// Get API URL sync
export const getApiUrl = (): string => {
  if (cachedApiUrl) return cachedApiUrl;
  cachedApiUrl = 'https://kanux-mobile-web-production.up.railway.app';
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

export const setAuthToken = (token: string | null) => authToken = token;
export const getAuthToken = (): string | null => authToken;

const getHeaders = (requiresAuth = true): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(requiresAuth && authToken && { Authorization: `Bearer ${authToken}` }),
});

// Generic API request (resolve base URL at request time to allow detection/init)
async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}, requiresAuth = true): Promise<T> {
  const base = await initApi();
  const response = await fetch(`${base}${endpoint}`, {
    ...options,
    headers: { ...getHeaders(requiresAuth), ...options.headers },
  });

  // Read body as text first to handle empty or non-JSON responses safely
  const text = await response.text();

  if (!text || text.trim() === '') {
    if (!response.ok) {
      // Debug 401: send token to public debug endpoint
      if (response.status === 401 && authToken) {
        debugJwt(base, authToken);
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
    if (response.status === 401 && authToken) {
      debugJwt(base, authToken);
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

  // Companies
  async getUserCompanies() { return apiRequest('/api/companies'); },
  async getCompanies() { return apiRequest('/api/companies'); },
  async getAllCompanies() { return apiRequest('/api/admin/companies'); },
  async getCompanyMembers(companyId: string) { return apiRequest(`/api/companies/${companyId}/members`); },

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
  async getChats(companyId?: string) {
    return apiRequest(companyId ? `/api/chats?companyId=${companyId}` : '/api/chats');
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

  async sendMessage(chatId: string, content: string, userProfileId: string) {
    return apiRequest(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, user_profile_id: userProfileId }),
    });
  },

  async deleteChat(id: string) {
    return apiRequest(`/api/chats?id=${id}`, { method: 'DELETE' });
  },

  // Verify company (no auth)
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

