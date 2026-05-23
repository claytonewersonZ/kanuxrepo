// Substitui todos os tickets pendentes
export async function replacePendingTickets(tickets: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_TICKETS, JSON.stringify(tickets));
  } catch (error) {
    console.error('Error replacing pending tickets:', error);
  }
}
// Offline storage for mobile app using AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  MESSAGES_PREFIX: 'offline_messages_',
  TICKETS_PREFIX: 'offline_tickets_',
  CHATS_PREFIX: 'offline_chats_',
  DEPARTMENTS_PREFIX: 'offline_departments_',
  COMPANIES: 'offline_companies',
  PENDING_MESSAGES: 'pending_messages',
  PENDING_TICKETS: 'pending_tickets',
  LAST_SYNC: 'last_sync',
  USER_COMPANY: 'user_company',
  USER_PROFILE: 'offline_user_profile',
};

// Messages storage
export async function saveMessagesOffline(chatId: string, messages: any[]): Promise<void> {
  try {
    const key = `${STORAGE_KEYS.MESSAGES_PREFIX}${chatId}`;
    await AsyncStorage.setItem(key, JSON.stringify(messages));
  } catch (error) {
    console.error('Error saving messages offline:', error);
  }
}

export async function getOfflineMessages(chatId: string): Promise<any[]> {
  try {
    const key = `${STORAGE_KEYS.MESSAGES_PREFIX}${chatId}`;
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting offline messages:', error);
    return [];
  }
}

// Tickets storage
export async function saveTicketsOffline(tickets: any[], companyId?: string): Promise<void> {
  try {
    if (companyId) {
      await AsyncStorage.setItem(`${STORAGE_KEYS.TICKETS_PREFIX}${companyId}`, JSON.stringify(tickets));
      return;
    }
    await AsyncStorage.setItem(`${STORAGE_KEYS.TICKETS_PREFIX}default`, JSON.stringify(tickets));
  } catch (error) {
    console.error('Error saving tickets offline:', error);
  }
}

export async function getOfflineTickets(companyId?: string): Promise<any[]> {
  try {
    const key = companyId
      ? `${STORAGE_KEYS.TICKETS_PREFIX}${companyId}`
      : `${STORAGE_KEYS.TICKETS_PREFIX}default`;
    const data = await AsyncStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting offline tickets:', error);
    return [];
  }
}

// Companies storage
export async function saveCompaniesOffline(companies: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.COMPANIES, JSON.stringify(companies));
  } catch (error) {
    console.error('Error saving companies offline:', error);
  }
}

export async function getOfflineCompanies(): Promise<any[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.COMPANIES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting offline companies:', error);
    return [];
  }
}

// Chats storage
export async function saveChatsOffline(companyId: string, chats: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(`${STORAGE_KEYS.CHATS_PREFIX}${companyId}`, JSON.stringify(chats));
  } catch (error) {
    console.error('Error saving chats offline:', error);
  }
}

export async function getOfflineChats(companyId: string): Promise<any[]> {
  try {
    const data = await AsyncStorage.getItem(`${STORAGE_KEYS.CHATS_PREFIX}${companyId}`);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting chats offline:', error);
    return [];
  }
}

// Departments storage
export async function saveDepartmentsOffline(companyId: string, departments: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(`${STORAGE_KEYS.DEPARTMENTS_PREFIX}${companyId}`, JSON.stringify(departments));
  } catch (error) {
    console.error('Error saving departments offline:', error);
  }
}

export async function getOfflineDepartments(companyId: string): Promise<any[]> {
  try {
    const data = await AsyncStorage.getItem(`${STORAGE_KEYS.DEPARTMENTS_PREFIX}${companyId}`);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting departments offline:', error);
    return [];
  }
}

// Pending operations (for sync when online)
export async function addPendingMessage(message: any): Promise<void> {
  try {
    const pending = await getPendingMessages();
    pending.push(message);
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_MESSAGES, JSON.stringify(pending));
  } catch (error) {
    console.error('Error adding pending message:', error);
  }
}

export async function getPendingMessages(): Promise<any[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_MESSAGES);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting pending messages:', error);
    return [];
  }
}

export async function clearPendingMessages(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_MESSAGES);
  } catch (error) {
    console.error('Error clearing pending messages:', error);
  }
}

export async function replacePendingMessages(messages: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_MESSAGES, JSON.stringify(messages));
  } catch (error) {
    console.error('Error replacing pending messages:', error);
  }
}

export async function addPendingTicket(ticket: any): Promise<void> {
  try {
    const pending = await getPendingTickets();
    pending.push(ticket);
    await AsyncStorage.setItem(STORAGE_KEYS.PENDING_TICKETS, JSON.stringify(pending));
  } catch (error) {
    console.error('Error adding pending ticket:', error);
  }
}

export async function getPendingTickets(): Promise<any[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_TICKETS);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting pending tickets:', error);
    return [];
  }
}

export async function clearPendingTickets(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_TICKETS);
  } catch (error) {
    console.error('Error clearing pending tickets:', error);
  }
}

// User company storage
export async function saveUserCompany(companyId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER_COMPANY, companyId);
  } catch (error) {
    console.error('Error saving user company:', error);
  }
}

export async function getUserCompany(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.USER_COMPANY);
  } catch (error) {
    console.error('Error getting user company:', error);
    return null;
  }
}

// Last sync timestamp
export async function updateLastSync(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
  } catch (error) {
    console.error('Error updating last sync:', error);
  }
}

export async function getLastSync(): Promise<Date | null> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
    return data ? new Date(data) : null;
  } catch (error) {
    console.error('Error getting last sync:', error);
    return null;
  }
}

// Clear all offline data
export async function clearAllOfflineData(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const dynamicKeys = allKeys.filter((key) =>
      key.startsWith(STORAGE_KEYS.MESSAGES_PREFIX) ||
      key.startsWith(STORAGE_KEYS.TICKETS_PREFIX) ||
      key.startsWith(STORAGE_KEYS.CHATS_PREFIX) ||
      key.startsWith(STORAGE_KEYS.DEPARTMENTS_PREFIX)
    );
    const fixedKeys = [
      STORAGE_KEYS.COMPANIES,
      STORAGE_KEYS.PENDING_MESSAGES,
      STORAGE_KEYS.PENDING_TICKETS,
      STORAGE_KEYS.LAST_SYNC,
      STORAGE_KEYS.USER_COMPANY,
      STORAGE_KEYS.USER_PROFILE,
    ];
    await AsyncStorage.multiRemove([...fixedKeys, ...dynamicKeys]);
  } catch (error) {
    console.error('Error clearing offline data:', error);
  }
}

// User profile cache (para funcionar offline sem Supabase Auth)
export async function saveProfileOffline(profile: any): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
  } catch (error) {
    console.error('Error saving profile offline:', error);
  }
}

export async function getOfflineProfile(): Promise<any | null> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting offline profile:', error);
    return null;
  }
}

