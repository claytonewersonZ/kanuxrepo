import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView } from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { getUserCompanies, getCompanyChats, Chat, getDepartments, Department, Company } from '../../src/lib/supabase';
import {
  getOfflineChats,
  getOfflineCompanies,
  getOfflineDepartments,
  getUserCompany,
  saveChatsOffline,
  saveCompaniesOffline,
  saveDepartmentsOffline,
  saveUserCompany,
} from '../../src/lib/offlineStorage';
import { api } from '../../src/lib/api';
import { colors, spacing, borderRadius } from '../../src/theme';
import { useUnreadCounts } from '../../src/contexts/NotificationContext';

interface ChatWithDepartment extends Chat {
  department?: Department;
}

export default function ChatsScreen() {
  const { user, profile, isOnline } = useAuth();
  const router = useRouter();
  const [chats, setChats] = useState<ChatWithDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [newChatPrivate, setNewChatPrivate] = useState(false);
  const [newChatDepartmentId, setNewChatDepartmentId] = useState<string>('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [creating, setCreating] = useState(false);
  const { counts: unreadCounts, markChatAsRead } = useUnreadCounts();

  async function loadData() {
    try {
      const companiesList = isOnline ? await getUserCompanies() : await getOfflineCompanies();
      setCompanies(companiesList);

      if (isOnline && companiesList.length > 0) {
        await saveCompaniesOffline(companiesList);
      }

      // Usa empresa salva ou a primeira
      const savedId = await getUserCompany();
      const valid = companiesList.find(c => c.id === savedId);
      const activeId = valid ? savedId! : companiesList[0]?.id || '';
      if (activeId) {
        setCompanyId(activeId);
        await saveUserCompany(activeId);
        await loadChatsForCompany(activeId);
      }
    } catch (error) {
      console.error('Erro ao carregar chats:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadChatsForCompany(cId: string) {
    try {
      const [chatsData, depts] = isOnline
        ? await Promise.all([getCompanyChats(cId), getDepartments(cId)])
        : await Promise.all([getOfflineChats(cId), getOfflineDepartments(cId)]);

      if (isOnline) {
        await Promise.all([
          saveChatsOffline(cId, chatsData),
          saveDepartmentsOffline(cId, depts),
        ]);
      }

      setDepartments(depts);
      const chatsWithDept: ChatWithDepartment[] = chatsData.map(c => ({
        ...c,
        department: depts.find(d => d.id === c.department_id) || undefined,
      }));
      setChats(chatsWithDept);
    } catch (error) {
      console.error('Erro ao carregar chats:', error);
      const [cachedChats, cachedDepartments] = await Promise.all([
        getOfflineChats(cId),
        getOfflineDepartments(cId),
      ]);
      setDepartments(cachedDepartments);
      setChats(
        cachedChats.map(c => ({
          ...c,
          department: cachedDepartments.find(d => d.id === c.department_id) || undefined,
        }))
      );
    }
  }

  async function handleSelectCompany(cId: string) {
    setCompanyId(cId);
    setShowCompanyPicker(false);
    await saveUserCompany(cId);
    setLoading(true);
    await loadChatsForCompany(cId);
    setLoading(false);
  }

  useEffect(() => {
    if (!user || !profile) { setLoading(false); return; }
    loadData();
  }, [user, profile, isOnline]);

  useFocusEffect(
    useCallback(() => {
      if (companyId) loadChatsForCompany(companyId);
    }, [companyId])
  );

  async function handleCreateChat() {
    if (!newChatName.trim()) {
      Alert.alert('Erro', 'Digite o nome do chat');
      return;
    }
    if (!companyId) {
      Alert.alert('Erro', 'Nenhuma empresa encontrada');
      return;
    }
    setCreating(true);
    try {
      const result = await api.createChat({
        companyId,
        name: newChatName.trim(),
        isPrivate: newChatPrivate,
        departmentId: newChatDepartmentId || undefined,
      });
      if (result?.data) {
        const dept = departments.find(d => d.id === newChatDepartmentId);
        const newChat: ChatWithDepartment = { ...result.data, department: dept };
        setChats(prev => [newChat, ...prev]);
        setNewChatName('');
        setNewChatPrivate(false);
        setNewChatDepartmentId('');
        setShowCreateModal(false);
      }
    } catch (error) {
      console.error('Erro ao criar chat:', error);
      Alert.alert('Erro', 'Falha ao criar chat');
    } finally {
      setCreating(false);
    }
  }

  const filteredChats = chats.filter(chat =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* Company Selector */}
      {companies.length > 1 && (
        <TouchableOpacity
          style={styles.companySelector}
          onPress={() => setShowCompanyPicker(true)}
          activeOpacity={0.7}
        >
          <View style={styles.companySelectorLeft}>
            <Ionicons name="business" size={16} color={colors.primary} />
            <Text style={styles.companySelectorText} numberOfLines={1}>
              {companies.find(c => c.id === companyId)?.name || 'Selecionar empresa'}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar chats..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredChats}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const unreadCount = unreadCounts[item.id] || 0;
          const hasUnread = unreadCount > 0;

          return (
            <TouchableOpacity
              style={styles.chatItem}
              onPress={() => {
                markChatAsRead(item.id);
                router.push(`/chat/${item.id}`);
              }}
            >
              <View style={styles.chatIconContainer}>
                {item.is_private ? (
                  <Ionicons name="lock-closed" size={18} color={colors.textMuted} />
                ) : (
                  <Text style={styles.hashIcon}>#</Text>
                )}
                {hasUnread && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.chatInfo}>
                <Text style={styles.chatName}>{item.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  {item.department && (
                    <View style={styles.deptBadge}>
                      <Text style={styles.deptBadgeText}>{item.department.name}</Text>
                    </View>
                  )}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>Nenhum chat encontrado</Text>
            <Text style={styles.emptySubtext}>Crie um novo chat para começar</Text>
          </View>
        }
      />

      {/* FAB - Create Chat */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreateModal(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={colors.text} />
      </TouchableOpacity>

      {/* Create Chat Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Novo Chat</Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="Nome do chat"
              placeholderTextColor={colors.textMuted}
              value={newChatName}
              onChangeText={setNewChatName}
              autoFocus
            />

            <TouchableOpacity
              style={styles.privateToggle}
              onPress={() => setNewChatPrivate(!newChatPrivate)}
            >
              <Ionicons
                name={newChatPrivate ? 'lock-closed' : 'lock-open'}
                size={20}
                color={newChatPrivate ? colors.warning : colors.textMuted}
              />
              <Text style={styles.privateToggleText}>
                {newChatPrivate ? 'Chat Privado' : 'Chat Público'}
              </Text>
            </TouchableOpacity>

            {/* Seletor de Departamento */}
            <Text style={styles.deptLabel}>Departamento (opcional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deptScroll}>
              <TouchableOpacity
                style={[styles.deptChip, !newChatDepartmentId && styles.deptChipActive]}
                onPress={() => setNewChatDepartmentId('')}
              >
                <Text style={[styles.deptChipText, !newChatDepartmentId && styles.deptChipTextActive]}>Nenhum</Text>
              </TouchableOpacity>
              {departments.map(d => (
                <TouchableOpacity
                  key={d.id}
                  style={[styles.deptChip, newChatDepartmentId === d.id && styles.deptChipActive]}
                  onPress={() => setNewChatDepartmentId(d.id)}
                >
                  <Text style={[styles.deptChipText, newChatDepartmentId === d.id && styles.deptChipTextActive]}>{d.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => { setShowCreateModal(false); setNewChatName(''); }}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalCreateButton, creating && { opacity: 0.5 }]}
                onPress={handleCreateChat}
                disabled={creating}
              >
                <Text style={styles.modalCreateText}>{creating ? 'Criando...' : 'Criar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Company Picker Modal */}
      <Modal visible={showCompanyPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={styles.modalTitle}>Selecionar Empresa</Text>
              <TouchableOpacity onPress={() => setShowCompanyPicker(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            {companies.map(item => (
              <TouchableOpacity
                key={item.id}
                style={[styles.companyPickerItem, item.id === companyId && styles.companyPickerItemActive]}
                onPress={() => handleSelectCompany(item.id)}
              >
                <View style={styles.companyPickerIcon}>
                  <Text style={styles.companyPickerInitial}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.companyPickerName}>{item.name}</Text>
                  <Text style={styles.companyPickerSlug}>@{item.slug}</Text>
                </View>
                {item.id === companyId && (
                  <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },  companySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  companySelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  companySelectorText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },  searchContainer: {
    padding: spacing.md,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  list: {
    padding: spacing.md,
    paddingBottom: 80,
  },
  chatItem: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  chatIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  unreadBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#8B5CF6',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  unreadBadgeText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
  },
  hashIcon: {
    color: colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
  },
  chatInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  chatName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  empty: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    color: colors.textMuted,
    fontSize: 14,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.backgroundLight,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  modalInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  privateToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: spacing.lg,
  },
  privateToggleText: {
    color: colors.text,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalCancelButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  modalCancelText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 16,
  },
  modalCreateButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  modalCreateText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 16,
  },
  deptBadge: {
    backgroundColor: colors.primary + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  deptBadgeText: {
    fontSize: 10,
    color: colors.primaryLight,
    fontWeight: '600',
  },
  deptLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  deptScroll: {
    marginBottom: spacing.lg,
    maxHeight: 44,
  },
  deptChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 20,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deptChipActive: {
    backgroundColor: colors.primary + '30',
    borderColor: colors.primary,
  },
  deptChipText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  deptChipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  companyPickerItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.xs,
    backgroundColor: colors.surface,
  },
  companyPickerItemActive: {
    backgroundColor: colors.primary + '18',
    borderWidth: 1, borderColor: colors.primary,
  },
  companyPickerIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary + '30', alignItems: 'center', justifyContent: 'center',
  },
  companyPickerInitial: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  companyPickerName: { fontSize: 15, fontWeight: '600', color: colors.text },
  companyPickerSlug: { fontSize: 12, color: colors.textMuted },
});
