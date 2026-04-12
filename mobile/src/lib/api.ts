// Cache for the detected API URL
let cachedApiUrl: string | null = null;
let detectionPromise: Promise<string> | null = null;

const detectApiUrl = async (): Promise<string> => {
  if (cachedApiUrl) return cachedApiUrl;
  
  console.log('🔍 Auto-detecting Java Backend API server...');
  
  // URLs to try in order of preference
  const urlsToTry = [
    'http://localhost:8080',           // Local development
    'http://10.0.2.2:8080',            // Android emulator
    'https://kanux-mobile-web-production.up.railway.app'  // Production
  ];
  
  for (const url of urlsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch(`${url}/api/verify-company`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'test' }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      // Any response means the server is reachable
      const text = await response.text();
      if (text.includes('success') || text.includes('error') || text.includes('company')) {
        cachedApiUrl = url;
        console.log('✅ Java Backend API found at:', url);
        return url;
      }
    } catch (error) {
      console.log('❌ Cannot reach:', url);
      continue;
    }
  }
  
  console.warn('⚠️ Could not auto-detect API server, using default');
  cachedApiUrl = 'http://localhost:8080';
  return cachedApiUrl;
};

// Get API URL
const getApiUrl = (): string => {
  if (cachedApiUrl) return cachedApiUrl;
  if (!detectionPromise) {
    detectionPromise = detectApiUrl();
  }
  return 'http://localhost:8080';
};

// Initialize API URL detection
export const initApi = async (): Promise<string> => {
  try {
    const Constants = await import('expo-constants');
    // Use manifest or default for config (expoConfig deprecated)
    const configUrl = Constants.default?.manifest?.extra?.apiUrl || Constants.default?.extra?.apiUrl;
    if (configUrl) {
      cachedApiUrl = configUrl;
      console.log('✅ Using configured API URL:', configUrl);
      return configUrl;
    }
    
    const isProduction = Constants.default?.manifest?.extra?.isProduction || Constants.default?.extra?.isProduction;
    if (isProduction) {
      cachedApiUrl = 'https://your-backend-production.com';
      console.log('✅ Using production API URL:', cachedApiUrl);
      return cachedApiUrl;
    }
  } catch (e) {
    // expo-constants not available
  }
  
  return detectApiUrl();
};

export const getApiUrlSync = (): string => {
  return getApiUrl();
};

// Token storage
let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const getAuthToken = (): string | null => {
  return authToken;
};

const getHeaders = (requiresAuth: boolean = true): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (requiresAuth && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  return headers;
};

const API_BASE_URL = getApiUrl();

// Generic fetch helper
async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}, requiresAuth: boolean = true): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...getHeaders(requiresAuth),
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || `Erro ${response.status}`);
  }

  return data;
}

export const api = {
  baseUrl: API_BASE_URL,
  
  // Auth
  async login(email: string, password: string) {
    const result: any = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, false);
    
    if (result.success && result.data?.token) {
      setAuthToken(result.data.token);
    }
    return result;
  },

  async getProfile() {
    return apiRequest('/api/profile');
  },

  async getUserCompanies() {
    return apiRequest('/api/companies');
  },

  async getCompanyMembers(companyId: string) {
    return apiRequest(`/api/companies/${companyId}/members`);
  },

  async updateProfile(data: { display_name?: string; avatar_url?: string; phone?: string; position?: string; department?: string }) {
    return apiRequest('/api/profile', { method: 'PATCH', body: JSON.stringify(data) });
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

  async deleteCompany(id: string) {
    return apiRequest(`/api/admin/company?id=${id}`, { method: 'DELETE' });
  },

  // Members
  async getMembers(companyId?: string) {
    const query = companyId ? `?companyId=${companyId}` : '';
    return apiRequest(`/api/admin/members${query}`);
  },

  async addMember(companyId: string, userProfileId: string, role: string = 'MEMBER') {
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
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/api/tickets${query}`);
  },

  async createTicket(data: {
    title: string;
    description?: string;
    companyId: string;
    departmentId?: string;
    priority?: string;
    creatorProfileId?: string;
  }) {
    return apiRequest('/api/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTicket(data: {
    id: string;
    title?: string;
    description?: string;
    priority?: string;
    status?: string;
    departmentId?: string;
    assigneeProfileId?: string;
  }) {
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
    if (companyId) params.append('companyId', companyId);
    if (chatId) params.append('chatId', chatId);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/api/chats${query}`);
  },

  async getMessages(chatId: string) {
    return apiRequest(`/api/chats/${chatId}/messages`);
  },

  async createChat(name: string, companyId: string, departmentId?: string, isPrivate: boolean = false) {
    return apiRequest('/api/chats', {
      method: 'POST',
      body: JSON.stringify({ type: 'chat', name, companyId, departmentId, is_private: isPrivate }),
    });
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

  // Verify Company
  async verifyCompany(slug: string) {
    return apiRequest('/api/verify-company', {
      method: 'POST',
      body: JSON.stringify({ slug }),
    }, false);
  },

  // Invite User
  async inviteUser(email: string, companyId: string, role: string = 'MEMBER', displayName?: string) {
    return apiRequest('/api/admin/invite-user', {
      method: 'POST',
      body: JSON.stringify({ email, company_id: companyId, role, display_name: displayName }),
    });
  },

  // Logout
  logout() {
    setAuthToken(null);
  },
};
