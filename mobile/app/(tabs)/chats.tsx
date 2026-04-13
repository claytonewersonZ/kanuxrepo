import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView } from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { getUserCompanies, getCompanyChats, Chat, getCompanyMembers, Profile, getDepartments, Department } from '../../src/lib/supabase';
import { getUserCompany, saveUserCompany } from '../../src/lib/offlineStorage';
import { api } from '../../src/lib/api';
import { colors, spacing } from '../../src/theme';

interface ChatWithDepartment extends Chat {
  department?: Department;
}

export default function ChatsScreen() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [chats, setChats] = useState<ChatWithDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [newChatPrivate, setNewChatPrivate] = useState(false);
  const [newChatDepartmentId, setNewChatDepartmentId] = useState<string>('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [creating, setCreating] = useState(false);

  async function loadData() {
    try {
      const companies = await getUserCompanies();
      // Usa empresa salva ou a primeira
      const savedId = await getUserCompany();
      const valid = companies.find(c => c.id === savedId);
      const activeId = valid ? savedId! : companies[0]?.id || '';
      if (activeId) {
        setCompanyId(activeId);
        await saveUserCompany(activeId);

        // Carrega chats e departamentos em paralelo
        const [chatsData, depts] = await Promise.all([
          getCompanyChats(activeId),
          getDepartments(activeId),
        ]);
        setDepartments(depts);

        // Associa departamento ao chat para exibir na lista
        const chatsWithDept: ChatWithDepartment[] = chatsData.map(c => ({
          ...c,
          department: depts.find(d => d.id === c.department_id) || undefined,
        }));
        setChats(chatsWithDept);
      }
    } catch (error) {
      console.error('Erro ao carregar chats:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [profile]);

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
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.chatItem}
            onPress={() => router.push(`/chat/${item.id}`)}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.chatInfo}>
              <Text style={styles.chatName}>{item.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                {item.is_private && (
                  <View style={styles.privateBadge}>
                    <Text style={styles.privateText}>Privado</Text>
                  </View>
                )}
                {item.department && (
                  <View style={styles.deptBadge}>
                    <Text style={styles.deptBadgeText}>{item.department.name}</Text>
                  </View>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchContainer: {
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
    borderRadius: 12,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  chatInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  privateBadge: {
    backgroundColor: colors.warning + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  privateText: {
    fontSize: 10,
    color: colors.warning,
    fontWeight: '600',
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
});

