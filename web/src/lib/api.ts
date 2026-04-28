import { supabase } from './supabaseClient';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}/api` : 'https://kanux-mobile-web.onrender.com/api';

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE}${endpoint}`;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  
  return response.json();
}

export const api = {
  auth: {
    login: (data: { email: string; password: string }) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  },
  companies: {
    list: () => apiFetch('/companies'),
    create: (data: any) => apiFetch('/companies', { method: 'POST', body: JSON.stringify(data) }),
  },
  tickets: {
    list: (params?: { companyId?: number }) => {
      const query = new URLSearchParams(params as any).toString();
      return apiFetch(`/tickets?${query}`);
    },
    get: (id: number) => apiFetch(`/tickets?ticketId=${id}`),
  },
};
