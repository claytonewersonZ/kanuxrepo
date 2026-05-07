
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Modal, Switch } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../src/theme';
import { api } from '../src/lib/api';
import { useWebSocket, WsErrorAlert } from '../src/contexts/WebSocketContext';
import { useAuth } from '../src/contexts/AuthContext';
import { isValidWorkingHoursInput } from '../src/lib/workingHours';

interface Company { id: string; name: string; slug: string; created_at: string; }
interface Ticket { id: string; title: string; status: string; priority: string; }
interface Member {
  id: string; role: string; user_profile_id: string;
  user_profiles: {
    id?: string;
    display_name: string;
    email: string;
    position?: string;
    phone?: string;
    work_start_time?: string | null;
    work_end_time?: string | null;
  };
}
interface Chat { id: string; name: string; is_private: boolean; only_admins_send?: boolean; department_id?: string; }
interface Department { id: string; name: string; slug: string; }
interface ChatMember { id?: string; user_profile_id: string; role: string; user_profile?: { display_name: string; email: string; }; }

const ROLE_ORDER = ['MEMBER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'];
const ROLE_COLORS: Record<string, string> = {
  MEMBER: colors.textMuted,
  MANAGER: colors.info ?? '#3B82F6',
  ADMIN: colors.warning ?? '#F59E0B',
  SUPER_ADMIN: colors.error ?? '#EF4444',
};

const SCREENS = [
  { id: 'tickets', name: 'Tickets' },
  { id: 'chats', name: 'Chats' },
  { id: 'mensagens', name: 'Mensagens' },
  { id: 'perfil', name: 'Perfil' },
  { id: 'departamentos', name: 'Departamentos' },
  { id: 'relatorios', name: 'Relatórios' },
];

const PERM_LEVELS = [
  { id: 'NONE', label: 'Bloqueado' },
  { id: 'VIEW', label: 'Ver' },
  { id: 'WRITE', label: 'Criar/Editar' },
  { id: 'FULL', label: 'Completo' },
];

export default function AdminScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { profile } = useAuth();
  const { subscribeAdminAlerts } = useWebSocket();
  const canManageWorkingHours = profile?.is_super_admin === true;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentCompanyId, setCurrentCompanyId] = useState<string>((params.companyId as string) || '');
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);

  // Alertas de erro em tempo real via WebSocket
  const [errorAlert, setErrorAlert] = useState<WsErrorAlert | null>(null);
  const alertTimerRef = useRef<any>(null);

  // ── Create User Modal ──────────────────────────────────────────────────────
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserPosition, setNewUserPosition] = useState('');
  const [newUserRole, setNewUserRole] = useState('MEMBER');
  const [newUserPermissions, setNewUserPermissions] = useState<Record<string, string>>({});
  const [newUserCompanyId, setNewUserCompanyId] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  // ── Create Chat Modal ──────────────────────────────────────────────────────
  const [showCreateChat, setShowCreateChat] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [newChatPrivate, setNewChatPrivate] = useState(false);
  const [newChatAdminOnly, setNewChatAdminOnly] = useState(false);
  const [newChatDeptId, setNewChatDeptId] = useState('');
  const [savingChat, setSavingChat] = useState(false);

  // ── Chat Members Modal ─────────────────────────────────────────────────────
  const [showChatMembers, setShowChatMembers] = useState(false);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [chatMembers, setChatMembers] = useState<ChatMember[]>([]);
  const [loadingChatMembers, setLoadingChatMembers] = useState(false);

  // ── Create Department Modal ────────────────────────────────────────────────
  const [showCreateDept, setShowCreateDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [savingDept, setSavingDept] = useState(false);

  // ── Department Members Modal ───────────────────────────────────────────────
  const [showDeptMembers, setShowDeptMembers] = useState(false);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [deptMembers, setDeptMembers] = useState<any[]>([]);
  const [loadingDeptMembers, setLoadingDeptMembers] = useState(false);

  // ── Edit User Modal ────────────────────────────────────────────────────────
  const [showEditUser, setShowEditUser] = useState(false);
  const [editUserId, setEditUserId] = useState('');
  const [editUserName, setEditUserName] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserPosition, setEditUserPosition] = useState('');
  const [editUserPhone, setEditUserPhone] = useState('');
  const [editUserRole, setEditUserRole] = useState('MEMBER');
  const [editUserPassword, setEditUserPassword] = useState('');
  const [editUserIsSuperAdmin, setEditUserIsSuperAdmin] = useState(false);
  const [editUserWorkStart, setEditUserWorkStart] = useState('');
  const [editUserWorkEnd, setEditUserWorkEnd] = useState('');
  const [savingEditUser, setSavingEditUser] = useState(false);

  useEffect(() => { checkSuperAdmin(); }, []);
  useEffect(() => { if (isSuperAdminUser) loadCompanies(); }, [isSuperAdminUser]);
  useEffect(() => { if (currentCompanyId) loadCompanyData(currentCompanyId); }, [currentCompanyId]);

  // Subscrever alertas de erro via WebSocket quando a empresa estiver selecionada
  useEffect(() => {
    if (!currentCompanyId) return;
    const unsub = subscribeAdminAlerts(currentCompanyId, (alert) => {
      setErrorAlert(alert);
      // Limpar alerta automaticamente após 8 segundos
      if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
      alertTimerRef.current = setTimeout(() => setErrorAlert(null), 8000);
    });
    return () => {
      unsub();
      if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    };
  }, [currentCompanyId, subscribeAdminAlerts]);

  async function checkSuperAdmin() {
    try {
      const res = await api.getProfile();
      if (res?.data?.is_super_admin || res?.data?.superAdmin) {
        setIsSuperAdminUser(true);
      } else {
        // Permitir também usuários com função ADMIN em qualquer empresa
        try {
          const companiesRes = await api.getAllCompanies();
          if (companiesRes?.data?.length > 0) {
            setIsSuperAdminUser(true); // Se getAllCompanies retornou dados, o usuário tem acesso à API admin
          } else {
            // Verificar a função do usuário nas suas empresas
            const userCompanies = await api.getCompanies();
            const companyList = userCompanies?.data || [];
            for (const c of companyList) {
              const membersRes = await api.getCompanyMembers(c.id);
              const me = (membersRes?.data || []).find((m: any) => m.user_profile_id === res?.data?.id);
              if (me && ['ADMIN', 'SUPER_ADMIN'].includes(String(me.role))) {
                setIsSuperAdminUser(true);
                return;
              }
            }
            router.replace('/(tabs)');
          }
        } catch {
          router.replace('/(tabs)');
        }
      }
    } catch {
      router.replace('/(auth)/login');
    } finally {
      setLoading(false);
    }
  }

  async function loadCompanies() {
    try {
      const res = await api.getAllCompanies();
      const list: Company[] = res?.data || [];
      setCompanies(list);
      if (list.length > 0 && !currentCompanyId) setCurrentCompanyId(list[0].id);
    } catch (e) { console.error('loadCompanies', e); }
  }

  async function loadCompanyData(companyId: string) {
    try {
      setCurrentCompany(companies.find(c => c.id === companyId) || null);
      const [membersRes, ticketsRes, chatsRes, deptsRes] = await Promise.all([
        api.getMembers(companyId),
        api.getTickets(companyId),
        api.getChats(companyId),
        api.getDepartments(companyId),
      ]);
      setMembers(membersRes?.data || []);
      setTickets(ticketsRes?.data || []);
      setChats(chatsRes?.data || []);
      setDepartments(deptsRes?.data || []);
    } catch (error) { console.error('loadCompanyData', error); }
  }

  // ── Members ────────────────────────────────────────────────────────────────
  async function handleRemoveMember(memberId: string) {
    Alert.alert('Remover Membro', 'Deseja remover este membro da empresa?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover', style: 'destructive', onPress: async () => {
          try {
            await api.removeMember(memberId);
            loadCompanyData(currentCompanyId);
          } catch (e: any) { Alert.alert('Erro', e.message); }
        },
      },
    ]);
  }

  async function handleUpdateRole(memberId: string, newRole: string) {
    try {
      await api.updateMember(memberId, newRole);
      loadCompanyData(currentCompanyId);
    } catch (e: any) { Alert.alert('Erro', e.message); }
  }

  async function handleCreateUser() {
    if (!newUserName.trim() || !newUserEmail.trim()) {
      Alert.alert('Erro', 'Nome e email são obrigatórios'); return;
    }
    if (!newUserPassword.trim() || newUserPassword.length < 6) {
      Alert.alert('Erro', 'Senha deve ter no mínimo 6 caracteres'); return;
    }
    const targetCompanyId = newUserCompanyId || currentCompanyId;
    if (!targetCompanyId) {
      Alert.alert('Erro', 'Selecione uma empresa'); return;
    }
    setSavingUser(true);
    try {
      await api.adminCreateUser({
        email: newUserEmail.trim(),
        password: newUserPassword,
        display_name: newUserName.trim(),
        position: newUserPosition.trim() || undefined,
        company_id: targetCompanyId,
        role: newUserRole,
        screen_permissions: JSON.stringify(newUserPermissions),
      });
      Alert.alert('Sucesso', `Usuário ${newUserName.trim()} criado com acesso ao sistema`);
      setShowCreateUser(false);
      resetUserForm();
      loadCompanyData(targetCompanyId);
    } catch (error: any) {
      Alert.alert('Erro', error.message || 'Falha ao criar usuário');
    } finally { setSavingUser(false); }
  }

  function resetUserForm() {
    setNewUserName(''); setNewUserEmail(''); setNewUserPassword('');
    setNewUserPosition(''); setNewUserRole('MEMBER');
    setNewUserCompanyId(currentCompanyId || '');
    setNewUserPermissions({});
  }

  function openEditUser(member: Member) {
    setEditUserId(member.user_profile_id);
    setEditUserName(member.user_profiles?.display_name || '');
    setEditUserEmail(member.user_profiles?.email || '');
    setEditUserPosition(member.user_profiles?.position || '');
    setEditUserPhone(member.user_profiles?.phone || '');
    setEditUserRole(member.role);
    setEditUserPassword('');
    setEditUserIsSuperAdmin(member.role === 'SUPER_ADMIN');
    setEditUserWorkStart(member.user_profiles?.work_start_time || '');
    setEditUserWorkEnd(member.user_profiles?.work_end_time || '');
    setShowEditUser(true);
  }

  async function handleSaveEditUser() {
    if (!editUserName.trim()) {
      Alert.alert('Erro', 'Nome é obrigatório'); return;
    }
    if (editUserPassword && editUserPassword.length < 6) {
      Alert.alert('Erro', 'Senha deve ter no mínimo 6 caracteres'); return;
    }
    if (canManageWorkingHours) {
      const hasStart = !!editUserWorkStart.trim();
      const hasEnd = !!editUserWorkEnd.trim();
      if (hasStart !== hasEnd) {
        Alert.alert('Erro', 'Informe os dois horários ou deixe ambos vazios'); return;
      }
      if (hasStart && (!isValidWorkingHoursInput(editUserWorkStart.trim()) || !isValidWorkingHoursInput(editUserWorkEnd.trim()))) {
        Alert.alert('Erro', 'Use o formato HH:mm para os horários'); return;
      }
    }
    setSavingEditUser(true);
    try {
      await api.adminUpdateUser(editUserId, {
        display_name: editUserName.trim(),
        email: editUserEmail.trim(),
        position: editUserPosition.trim() || undefined,
        phone: editUserPhone.trim() || undefined,
        password: editUserPassword || undefined,
        role: editUserRole,
        company_id: currentCompanyId,
        is_super_admin: editUserRole === 'SUPER_ADMIN' ? 'true' : 'false',
        ...(canManageWorkingHours ? {
          work_start_time: editUserWorkStart.trim(),
          work_end_time: editUserWorkEnd.trim(),
        } : {}),
      });
      Alert.alert('Sucesso', 'Usuário atualizado');
      setShowEditUser(false);
      loadCompanyData(currentCompanyId);
    } catch (error: any) {
      Alert.alert('Erro', error.message || 'Falha ao atualizar usuário');
    } finally { setSavingEditUser(false); }
  }

  // ── Chats ──────────────────────────────────────────────────────────────────
  async function handleCreateChat() {
    if (!newChatName.trim()) { Alert.alert('Erro', 'Nome do chat é obrigatório'); return; }
    setSavingChat(true);
    try {
      await api.createChat({
        companyId: currentCompanyId,
        name: newChatName.trim(),
        isPrivate: newChatPrivate,
        only_admins_send: newChatAdminOnly,
        departmentId: newChatDeptId || undefined,
      });
      setShowCreateChat(false);
      setNewChatName(''); setNewChatPrivate(false); setNewChatAdminOnly(false); setNewChatDeptId('');
      loadCompanyData(currentCompanyId);
    } catch (e: any) { Alert.alert('Erro', e.message); }
    finally { setSavingChat(false); }
  }

  async function handleDeleteChat(chat: Chat) {
    Alert.alert('Excluir Chat', `Excluir "#${chat.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive', onPress: async () => {
          try {
            await api.deleteChat(chat.id);
            loadCompanyData(currentCompanyId);
          } catch (e: any) { Alert.alert('Erro', e.message); }
        },
      },
    ]);
  }

  async function handleToggleChatPermission(chat: Chat) {
    try {
      const newValue = !chat.only_admins_send;
      await api.updateChat(chat.id, { only_admins_send: newValue });
      setChats(prev => prev.map(c => c.id === chat.id ? { ...c, only_admins_send: newValue } : c));
    } catch (e: any) { Alert.alert('Erro', e.message); }
  }

  async function openChatMembers(chat: Chat) {
    setSelectedChat(chat);
    setLoadingChatMembers(true);
    setShowChatMembers(true);
    try {
      const res = await api.getChatMembers(chat.id);
      setChatMembers(res?.data || []);
    } catch (e: any) { Alert.alert('Erro', e.message); }
    finally { setLoadingChatMembers(false); }
  }

  async function handleAddMemberToChat(userProfileId: string) {
    if (!selectedChat) return;
    try {
      await api.addChatMember(selectedChat.id, userProfileId);
      const res = await api.getChatMembers(selectedChat.id);
      setChatMembers(res?.data || []);
    } catch (e: any) { Alert.alert('Erro', e.message); }
  }

  async function handleRemoveMemberFromChat(userProfileId: string) {
    if (!selectedChat) return;
    try {
      await api.removeChatMember(selectedChat.id, userProfileId);
      setChatMembers(prev => prev.filter(m => m.user_profile_id !== userProfileId));
    } catch (e: any) { Alert.alert('Erro', e.message); }
  }

  // ── Departments ────────────────────────────────────────────────────────────
  async function handleCreateDept() {
    if (!newDeptName.trim()) { Alert.alert('Erro', 'Nome do departamento é obrigatório'); return; }
    setSavingDept(true);
    try {
      await api.createDepartment(currentCompanyId, newDeptName.trim());
      setShowCreateDept(false);
      setNewDeptName('');
      loadCompanyData(currentCompanyId);
    } catch (e: any) { Alert.alert('Erro', e.message); }
    finally { setSavingDept(false); }
  }

  async function handleDeleteDept(dept: Department) {
    Alert.alert('Excluir Departamento', `Excluir "${dept.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive', onPress: async () => {
          try {
            await api.deleteDepartment(dept.id);
            loadCompanyData(currentCompanyId);
          } catch (e: any) { Alert.alert('Erro', e.message); }
        },
      },
    ]);
  }

  async function openDeptMembers(dept: Department) {
    setSelectedDept(dept);
    setLoadingDeptMembers(true);
    setShowDeptMembers(true);
    try {
      const res = await api.getDeptMembers(dept.id);
      setDeptMembers(res?.data || []);
    } catch (e: any) { Alert.alert('Erro', e.message); }
    finally { setLoadingDeptMembers(false); }
  }

  async function handleAddMemberToDept(userProfileId: string) {
    if (!selectedDept) return;
    try {
      await api.addDeptMember(selectedDept.id, userProfileId);
      const res = await api.getDeptMembers(selectedDept.id);
      setDeptMembers(res?.data || []);
    } catch (e: any) { Alert.alert('Erro', e.message); }
  }

  async function handleRemoveMemberFromDept(userProfileId: string) {
    if (!selectedDept) return;
    try {
      await api.removeDeptMember(selectedDept.id, userProfileId);
      setDeptMembers(prev => prev.filter((m: any) => m.user_profile_id !== userProfileId));
    } catch (e: any) { Alert.alert('Erro', e.message); }
  }

  const deptMemberIds = new Set(deptMembers.map((m: any) => m.user_profile_id));
  const membersNotInDept = members.filter(m => !deptMemberIds.has(m.user_profile_id));

  if (loading || !isSuperAdminUser) {
    return <View style={styles.loadingContainer}><Text style={styles.loadingText}>Carregando...</Text></View>;
  }

  const openTickets = tickets.filter(t => t.status === 'OPEN').length;

  const tabs = [
    { key: 'overview', icon: 'grid' as const, label: 'Geral' },
    { key: 'users', icon: 'people' as const, label: 'Usuários' },
    { key: 'chats', icon: 'chatbubbles' as const, label: 'Chats' },
    { key: 'departments', icon: 'folder' as const, label: 'Deptos' },
    { key: 'permissions', icon: 'shield-checkmark' as const, label: 'Perms' },
  ];

  // Membros que ainda não estão no chat selecionado
  const chatMemberIds = new Set(chatMembers.map(m => m.user_profile_id));
  const membersNotInChat = members.filter(m => !chatMemberIds.has(m.user_profile_id));

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Painel Super Admin</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Company selector */}
      <View style={styles.companySelectorBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.sm, gap: 6 }}>
          {companies.map(company => (
            <TouchableOpacity
              key={company.id}
              style={[styles.companyChip, currentCompanyId === company.id && styles.companyChipActive]}
              onPress={() => setCurrentCompanyId(company.id)}
            >
              <Text style={[styles.companyChipText, currentCompanyId === company.id && styles.companyChipTextActive]}>
                {company.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

        {errorAlert && (
          <View style={styles.errorAlertBanner}>
            <Ionicons name="warning" size={18} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorAlertTitle}>Erro HTTP {errorAlert.status}</Text>
              <Text style={styles.errorAlertText} numberOfLines={2}>
                {errorAlert.method} {errorAlert.endpoint} - {errorAlert.description || 'Falha detectada'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setErrorAlert(null)}>
              <Ionicons name="close" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

      {/* Tabs */}
      <View style={styles.tabs}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon} size={16} color={activeTab === tab.key ? colors.primary : colors.textMuted} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {/* ── Overview ──────────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionLabel}>ESTATÍSTICAS — {currentCompany?.name || '(selecione uma empresa)'}</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Ionicons name="people" size={22} color={colors.primary} />
                <Text style={styles.statNumber}>{members.length}</Text>
                <Text style={styles.statLabel}>Membros</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="ticket" size={22} color={colors.warning ?? '#F59E0B'} />
                <Text style={styles.statNumber}>{tickets.length}</Text>
                <Text style={styles.statLabel}>Tickets</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="chatbubbles" size={22} color={colors.info ?? '#3B82F6'} />
                <Text style={styles.statNumber}>{chats.length}</Text>
                <Text style={styles.statLabel}>Chats</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="alert-circle" size={22} color={colors.error ?? '#EF4444'} />
                <Text style={styles.statNumber}>{openTickets}</Text>
                <Text style={styles.statLabel}>Abertos</Text>
              </View>
            </View>
            <View style={styles.statCard2}>
              <Ionicons name="folder" size={18} color={colors.primary} />
              <Text style={styles.statNumber2}>{departments.length} departamentos</Text>
            </View>
            {/* ── Logs Button ── */}
            {currentCompanyId ? (
              <TouchableOpacity
                style={styles.logsNavButton}
                onPress={() => router.push({ pathname: '/admin/logs' } as any)}
                activeOpacity={0.8}
              >
                <Ionicons name="pulse-outline" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.logsNavTitle}>Log de Atividades</Text>
                  <Text style={styles.logsNavSub}>Ver histórico de mensagens, tickets e acessos</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* ── Users ─────────────────────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>MEMBROS — {currentCompany?.name}</Text>
              <TouchableOpacity style={styles.addButton} onPress={() => { setNewUserCompanyId(currentCompanyId || ''); setShowCreateUser(true); }}>
                <Ionicons name="add" size={16} color={colors.text} />
                <Text style={styles.addButtonText}>Novo</Text>
              </TouchableOpacity>
            </View>

            {members.map(member => (
              <TouchableOpacity key={member.id} style={styles.memberItem} onPress={() => openEditUser(member)}>
                <View style={[styles.memberAvatar, { backgroundColor: ROLE_COLORS[member.role] + '40' }]}>
                  <Text style={[styles.memberAvatarText, { color: ROLE_COLORS[member.role] }]}>
                    {(member.user_profiles?.display_name || 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.user_profiles?.display_name || 'Sem nome'}</Text>
                  <Text style={styles.memberEmail}>{member.user_profiles?.email || '-'}</Text>
                  {member.user_profiles?.position && (
                    <Text style={styles.memberPosition}>{member.user_profiles.position}</Text>
                  )}
                  {member.user_profiles?.work_start_time && member.user_profiles?.work_end_time && (
                    <Text style={styles.memberPosition}>
                      Horário: {member.user_profiles.work_start_time} - {member.user_profiles.work_end_time}
                    </Text>
                  )}
                </View>
                <View style={[styles.roleChip, { backgroundColor: ROLE_COLORS[member.role] + '20' }]}>
                  <Text style={[styles.roleText, { color: ROLE_COLORS[member.role] }]}>{member.role}</Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveMember(member.id)} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={18} color={colors.error ?? '#EF4444'} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            {members.length === 0 && <Text style={styles.emptyText}>Nenhum membro nesta empresa</Text>}
          </View>
        )}

        {/* ── Chats ─────────────────────────────────────────────────────────── */}
        {activeTab === 'chats' && (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>CHATS — {currentCompany?.name}</Text>
              <TouchableOpacity style={styles.addButton} onPress={() => setShowCreateChat(true)}>
                <Ionicons name="add" size={16} color={colors.text} />
                <Text style={styles.addButtonText}>Novo</Text>
              </TouchableOpacity>
            </View>

            {chats.map(chat => (
              <View key={chat.id} style={styles.chatConfigItem}>
                <View style={styles.chatConfigTop}>
                  <View style={styles.chatConfigLeft}>
                    {chat.is_private
                      ? <Ionicons name="lock-closed" size={16} color={colors.warning ?? '#F59E0B'} />
                      : <Text style={styles.hashIcon}>#</Text>}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.chatConfigName}>{chat.name}</Text>
                      <Text style={styles.chatConfigType}>{chat.is_private ? 'Privado' : 'Público'}</Text>
                    </View>
                  </View>
                  <View style={styles.chatActions}>
                    <TouchableOpacity style={styles.chatActionBtn} onPress={() => openChatMembers(chat)}>
                      <Ionicons name="people-outline" size={18} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.chatActionBtn} onPress={() => handleDeleteChat(chat)}>
                      <Ionicons name="trash-outline" size={18} color={colors.error ?? '#EF4444'} />
                    </TouchableOpacity>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.permToggle, chat.only_admins_send ? styles.permToggleRestricted : styles.permToggleOpen]}
                  onPress={() => handleToggleChatPermission(chat)}
                >
                  <Ionicons
                    name={chat.only_admins_send ? 'shield' : 'globe'}
                    size={13}
                    color={chat.only_admins_send ? (colors.warning ?? '#F59E0B') : (colors.success ?? '#10B981')}
                  />
                  <Text style={[styles.permToggleText, { color: chat.only_admins_send ? (colors.warning ?? '#F59E0B') : (colors.success ?? '#10B981') }]}>
                    {chat.only_admins_send ? 'Só Admin/Manager enviam' : 'Todos podem enviar'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
            {chats.length === 0 && <Text style={styles.emptyText}>Nenhum chat</Text>}
          </View>
        )}

        {/* ── Departments ───────────────────────────────────────────────────── */}
        {activeTab === 'departments' && (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>DEPARTAMENTOS — {currentCompany?.name}</Text>
              <TouchableOpacity style={styles.addButton} onPress={() => setShowCreateDept(true)}>
                <Ionicons name="add" size={16} color={colors.text} />
                <Text style={styles.addButtonText}>Novo</Text>
              </TouchableOpacity>
            </View>

            {departments.map(dept => (
              <View key={dept.id} style={styles.deptItem}>
                <Ionicons name="folder" size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.deptName}>{dept.name}</Text>
                  <Text style={styles.deptSlug}>@{dept.slug}</Text>
                </View>
                <TouchableOpacity onPress={() => openDeptMembers(dept)} style={{ padding: 4 }}>
                  <Ionicons name="people-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteDept(dept)} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={18} color={colors.error ?? '#EF4444'} />
                </TouchableOpacity>
              </View>
            ))}
            {departments.length === 0 && <Text style={styles.emptyText}>Nenhum departamento</Text>}
          </View>
        )}

        {/* ── Permissions Matrix ────────────────────────────────────────────── */}
        {activeTab === 'permissions' && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionLabel}>PERMISSÕES POR FUNÇÃO</Text>
            <Text style={styles.hintText}>
              Visão geral do que cada função pode fazer no sistema.
              Para alterar, mude a função do membro na aba Usuários.
            </Text>
            {[
              { section: 'Tickets', member: ['SELECT'], manager: ['SELECT','INSERT','UPDATE'], admin: ['SELECT','INSERT','UPDATE','DELETE'] },
              { section: 'Chats', member: ['SELECT'], manager: ['SELECT','INSERT'], admin: ['SELECT','INSERT','UPDATE','DELETE'] },
              { section: 'Mensagens', member: ['SELECT','INSERT'], manager: ['SELECT','INSERT','DELETE'], admin: ['SELECT','INSERT','UPDATE','DELETE'] },
              { section: 'Membros', member: ['SELECT'], manager: ['SELECT'], admin: ['SELECT','INSERT','UPDATE','DELETE'] },
              { section: 'Departamentos', member: ['SELECT'], manager: ['SELECT'], admin: ['SELECT','INSERT','DELETE'] },
              { section: 'Painel Admin', member: [], manager: [], admin: [], superAdmin: ['TUDO'] },
            ].map(row => (
              <View key={row.section} style={styles.permRow}>
                <Text style={styles.permSection}>{row.section}</Text>
                <View style={styles.permCols}>
                  {[
                    { label: 'MEMBER', perms: row.member },
                    { label: 'MANAGER', perms: row.manager },
                    { label: 'ADMIN', perms: row.admin },
                    { label: 'SUPER', perms: row.superAdmin ?? ['SELECT','INSERT','UPDATE','DELETE'] },
                  ].map(col => (
                    <View key={col.label} style={styles.permCol}>
                      <Text style={[styles.permColLabel, { color: ROLE_COLORS[col.label === 'SUPER' ? 'SUPER_ADMIN' : col.label] }]}>
                        {col.label}
                      </Text>
                      {col.perms.length === 0
                        ? <Text style={styles.permNone}>—</Text>
                        : col.perms.map(p => (
                          <View key={p} style={styles.permBadge}>
                            <Text style={styles.permBadgeText}>{p}</Text>
                          </View>
                        ))}
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ══ Modal: Criar Usuário ══════════════════════════════════════════════ */}
      <Modal visible={showCreateUser} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo Usuário</Text>
              <TouchableOpacity onPress={() => { setShowCreateUser(false); resetUserForm(); }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>NOME COMPLETO *</Text>
            <TextInput style={styles.modalInput} placeholder="Ex: João Silva" placeholderTextColor={colors.textMuted}
              value={newUserName} onChangeText={setNewUserName} autoCorrect={false} />

            <Text style={styles.fieldLabel}>EMAIL *</Text>
            <TextInput style={styles.modalInput} placeholder="email@exemplo.com" placeholderTextColor={colors.textMuted}
              value={newUserEmail} onChangeText={setNewUserEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />

            <Text style={styles.fieldLabel}>SENHA * (mín. 6 caracteres)</Text>
            <TextInput style={styles.modalInput} placeholder="Senha de acesso" placeholderTextColor={colors.textMuted}
              value={newUserPassword} onChangeText={setNewUserPassword} secureTextEntry autoCorrect={false} autoComplete="off" />

            <Text style={styles.fieldLabel}>CARGO</Text>
            <TextInput style={styles.modalInput} placeholder="Ex: Analista de Suporte" placeholderTextColor={colors.textMuted}
              value={newUserPosition} onChangeText={setNewUserPosition} />

            <Text style={styles.fieldLabel}>FUNÇÃO NA EMPRESA</Text>
            <View style={styles.roleSelector}>
              {ROLE_ORDER.map(role => (
                <TouchableOpacity
                  key={role}
                  style={[styles.roleSelectorItem, newUserRole === role && { ...styles.roleSelectorItemActive, borderColor: ROLE_COLORS[role] }]}
                  onPress={() => setNewUserRole(role)}
                >
                  <Text style={[styles.roleSelectorText, newUserRole === role && { color: ROLE_COLORS[role], fontWeight: '700' }]}>
                    {role === 'SUPER_ADMIN' ? 'SUPER' : role}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>EMPRESA *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
              {companies.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.deptChip, (newUserCompanyId || currentCompanyId) === c.id && styles.deptChipActive, { marginRight: 6 }]}
                  onPress={() => setNewUserCompanyId(c.id)}
                >
                  <Text style={[styles.deptChipText, (newUserCompanyId || currentCompanyId) === c.id && styles.deptChipTextActive]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>ACESSO POR TELA</Text>
            <Text style={[styles.hintText, { marginTop: 0 }]}>Defina o nível de acesso de cada módulo para este usuário.</Text>
            {SCREENS.map(screen => (
              <View key={screen.id} style={styles.permScreenRow}>
                <Text style={styles.permScreenName}>{screen.name}</Text>
                <View style={styles.permLevelRow}>
                  {PERM_LEVELS.map(level => (
                    <TouchableOpacity
                      key={level.id}
                      style={[
                        styles.permLevelBtn,
                        (newUserPermissions[screen.id] || 'VIEW') === level.id && styles.permLevelBtnActive,
                      ]}
                      onPress={() => setNewUserPermissions(prev => ({ ...prev, [screen.id]: level.id }))}
                    >
                      <Text style={[
                        styles.permLevelText,
                        (newUserPermissions[screen.id] || 'VIEW') === level.id && styles.permLevelTextActive,
                      ]}>{level.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setShowCreateUser(false); resetUserForm(); }}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, savingUser && { opacity: 0.5 }]}
                onPress={handleCreateUser} disabled={savingUser}
              >
                <Text style={styles.modalSaveText}>{savingUser ? 'Criando...' : 'Criar Usuário'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ══ Modal: Criar Chat ════════════════════════════════════════════════ */}
      <Modal visible={showCreateChat} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo Chat</Text>
              <TouchableOpacity onPress={() => setShowCreateChat(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>NOME DO CHAT *</Text>
            <TextInput style={styles.modalInput} placeholder="Ex: suporte-geral" placeholderTextColor={colors.textMuted}
              value={newChatName} onChangeText={setNewChatName} autoCapitalize="none" />

            <Text style={styles.fieldLabel}>DEPARTAMENTO (opcional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
              <TouchableOpacity
                style={[styles.deptChip, !newChatDeptId && styles.deptChipActive]}
                onPress={() => setNewChatDeptId('')}
              >
                <Text style={[styles.deptChipText, !newChatDeptId && styles.deptChipTextActive]}>Nenhum</Text>
              </TouchableOpacity>
              {departments.map(d => (
                <TouchableOpacity key={d.id}
                  style={[styles.deptChip, newChatDeptId === d.id && styles.deptChipActive]}
                  onPress={() => setNewChatDeptId(d.id)}
                >
                  <Text style={[styles.deptChipText, newChatDeptId === d.id && styles.deptChipTextActive]}>{d.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Chat Privado</Text>
                <Text style={styles.toggleSub}>Apenas membros adicionados podem ver</Text>
              </View>
              <Switch value={newChatPrivate} onValueChange={setNewChatPrivate} trackColor={{ true: colors.primary }} />
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Somente Admin/Manager enviam</Text>
                <Text style={styles.toggleSub}>Membros só podem ler as mensagens</Text>
              </View>
              <Switch value={newChatAdminOnly} onValueChange={setNewChatAdminOnly} trackColor={{ true: colors.warning ?? '#F59E0B' }} />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowCreateChat(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, savingChat && { opacity: 0.5 }]}
                onPress={handleCreateChat} disabled={savingChat}>
                <Text style={styles.modalSaveText}>{savingChat ? 'Criando...' : 'Criar Chat'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══ Modal: Membros do Chat ═══════════════════════════════════════════ */}
      <Modal visible={showChatMembers} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>#{selectedChat?.name} — Membros</Text>
              <TouchableOpacity onPress={() => setShowChatMembers(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {loadingChatMembers ? (
              <Text style={styles.emptyText}>Carregando...</Text>
            ) : (
              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>MEMBROS ATUAIS</Text>
                {chatMembers.length === 0 && <Text style={styles.emptyText}>Nenhum membro</Text>}
                {chatMembers.map(cm => (
                  <View key={cm.user_profile_id} style={styles.chatMemberRow}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>
                        {(cm.user_profile?.display_name || 'U').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{cm.user_profile?.display_name || cm.user_profile_id.slice(0, 8)}</Text>
                      <Text style={styles.memberEmail}>{cm.user_profile?.email || ''}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleRemoveMemberFromChat(cm.user_profile_id)} style={{ padding: 4 }}>
                      <Ionicons name="remove-circle-outline" size={20} color={colors.error ?? '#EF4444'} />
                    </TouchableOpacity>
                  </View>
                ))}

                {membersNotInChat.length > 0 && (
                  <>
                    <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>ADICIONAR MEMBRO</Text>
                    {membersNotInChat.map(m => (
                      <TouchableOpacity
                        key={m.id}
                        style={styles.addMemberRow}
                        onPress={() => handleAddMemberToChat(m.user_profile_id)}
                      >
                        <View style={[styles.memberAvatar, { backgroundColor: colors.surface }]}>
                          <Text style={[styles.memberAvatarText, { color: colors.textMuted }]}>
                            {(m.user_profiles?.display_name || 'U').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.memberName}>{m.user_profiles?.display_name}</Text>
                          <Text style={styles.memberEmail}>{m.user_profiles?.email}</Text>
                        </View>
                        <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ══ Modal: Criar Departamento ════════════════════════════════════════ */}
      <Modal visible={showCreateDept} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo Departamento</Text>
              <TouchableOpacity onPress={() => setShowCreateDept(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>NOME *</Text>
            <TextInput style={styles.modalInput} placeholder="Ex: Suporte Técnico" placeholderTextColor={colors.textMuted}
              value={newDeptName} onChangeText={setNewDeptName} autoFocus />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowCreateDept(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, savingDept && { opacity: 0.5 }]}
                onPress={handleCreateDept} disabled={savingDept}>
                <Text style={styles.modalSaveText}>{savingDept ? 'Criando...' : 'Criar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══ Modal: Membros do Departamento ═══════════════════════════════════ */}
      <Modal visible={showDeptMembers} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedDept?.name} — Membros</Text>
              <TouchableOpacity onPress={() => setShowDeptMembers(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {loadingDeptMembers ? (
              <Text style={styles.emptyText}>Carregando...</Text>
            ) : (
              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>MEMBROS DO DEPARTAMENTO</Text>
                {deptMembers.length === 0 && <Text style={styles.emptyText}>Nenhum membro</Text>}
                {deptMembers.map((dm: any) => (
                  <View key={dm.user_profile_id} style={styles.chatMemberRow}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>
                        {(dm.user_profile?.display_name || 'U').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{dm.user_profile?.display_name || dm.user_profile_id?.slice(0, 8)}</Text>
                      <Text style={styles.memberEmail}>{dm.user_profile?.email || ''}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleRemoveMemberFromDept(dm.user_profile_id)} style={{ padding: 4 }}>
                      <Ionicons name="remove-circle-outline" size={20} color={colors.error ?? '#EF4444'} />
                    </TouchableOpacity>
                  </View>
                ))}

                {membersNotInDept.length > 0 && (
                  <>
                    <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>ADICIONAR MEMBRO</Text>
                    {membersNotInDept.map(m => (
                      <TouchableOpacity
                        key={m.id}
                        style={styles.addMemberRow}
                        onPress={() => handleAddMemberToDept(m.user_profile_id)}
                      >
                        <View style={[styles.memberAvatar, { backgroundColor: colors.surface }]}>
                          <Text style={[styles.memberAvatarText, { color: colors.textMuted }]}>
                            {(m.user_profiles?.display_name || 'U').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.memberName}>{m.user_profiles?.display_name}</Text>
                          <Text style={styles.memberEmail}>{m.user_profiles?.email}</Text>
                        </View>
                        <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ══ Modal: Editar Usuário ═════════════════════════════════════════════ */}
      <Modal visible={showEditUser} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar Usuário</Text>
              <TouchableOpacity onPress={() => setShowEditUser(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>NOME COMPLETO *</Text>
            <TextInput style={styles.modalInput} placeholder="Nome" placeholderTextColor={colors.textMuted}
              value={editUserName} onChangeText={setEditUserName} autoCorrect={false} />

            <Text style={styles.fieldLabel}>EMAIL</Text>
            <TextInput style={styles.modalInput} placeholder="email@exemplo.com" placeholderTextColor={colors.textMuted}
              value={editUserEmail} onChangeText={setEditUserEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />

            <Text style={styles.fieldLabel}>CARGO</Text>
            <TextInput style={styles.modalInput} placeholder="Ex: Analista" placeholderTextColor={colors.textMuted}
              value={editUserPosition} onChangeText={setEditUserPosition} />

            <Text style={styles.fieldLabel}>TELEFONE</Text>
            <TextInput style={styles.modalInput} placeholder="(00) 00000-0000" placeholderTextColor={colors.textMuted}
              value={editUserPhone} onChangeText={setEditUserPhone} keyboardType="phone-pad" />

            <Text style={styles.fieldLabel}>NOVA SENHA (deixe vazio para manter)</Text>
            <TextInput style={styles.modalInput} placeholder="Mín. 6 caracteres" placeholderTextColor={colors.textMuted}
              value={editUserPassword} onChangeText={setEditUserPassword} secureTextEntry autoCorrect={false} autoComplete="off" />

            {canManageWorkingHours && (
              <>
                <Text style={styles.fieldLabel}>HORÁRIO DE TRABALHO</Text>
                <Text style={styles.hintText}>Deixe os dois campos vazios para não restringir o usuário.</Text>
                <View style={styles.timeRow}>
                  <TextInput
                    style={[styles.modalInput, styles.timeInput]}
                    placeholder="08:00"
                    placeholderTextColor={colors.textMuted}
                    value={editUserWorkStart}
                    onChangeText={setEditUserWorkStart}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                  <Text style={styles.timeSeparator}>até</Text>
                  <TextInput
                    style={[styles.modalInput, styles.timeInput]}
                    placeholder="18:00"
                    placeholderTextColor={colors.textMuted}
                    value={editUserWorkEnd}
                    onChangeText={setEditUserWorkEnd}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                  />
                </View>
              </>
            )}

            <Text style={styles.fieldLabel}>FUNÇÃO NA EMPRESA</Text>
            <View style={styles.roleSelector}>
              {ROLE_ORDER.map(role => (
                <TouchableOpacity
                  key={role}
                  style={[styles.roleSelectorItem, editUserRole === role && { ...styles.roleSelectorItemActive, borderColor: ROLE_COLORS[role] }]}
                  onPress={() => setEditUserRole(role)}
                >
                  <Text style={[styles.roleSelectorText, editUserRole === role && { color: ROLE_COLORS[role], fontWeight: '700' }]}>
                    {role === 'SUPER_ADMIN' ? 'SUPER' : role}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowEditUser(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, savingEditUser && { opacity: 0.5 }]}
                onPress={handleSaveEditUser} disabled={savingEditUser}
              >
                <Text style={styles.modalSaveText}>{savingEditUser ? 'Salvando...' : 'Salvar'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.text },
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md, backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  companySelectorBar: { paddingVertical: spacing.sm, backgroundColor: colors.backgroundLight },
  errorAlertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.error ?? '#EF4444',
    marginHorizontal: spacing.md, marginTop: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  errorAlertTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  errorAlertText: { color: '#fff', fontSize: 12, opacity: 0.92, marginTop: 1 },
  companyChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: borderRadius.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  companyChipActive: { backgroundColor: colors.primary + '18', borderColor: colors.primary },
  companyChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  companyChipTextActive: { color: colors.text, fontWeight: '600' },
  tabs: { flexDirection: 'row', paddingHorizontal: 6, paddingVertical: 4, backgroundColor: colors.surface, gap: 2 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 7 },
  tabActive: { backgroundColor: colors.primary + '18' },
  tabText: { fontSize: 9, color: colors.textMuted, marginTop: 1 },
  tabTextActive: { color: colors.primary, fontWeight: '700' },
  content: { flex: 1 },
  tabContent: { padding: spacing.md, gap: spacing.sm },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: spacing.xs },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  hintText: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 18 },
  addButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: borderRadius.sm,
  },
  addButtonText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  // Estatísticas
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
  statCard: { width: '48%', backgroundColor: colors.surface, borderRadius: borderRadius.sm, padding: spacing.md, alignItems: 'center', gap: 4 },
  statCard2: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: borderRadius.sm, padding: spacing.md },
  statNumber: { fontSize: 22, fontWeight: '700', color: colors.text },
  statNumber2: { fontSize: 15, fontWeight: '600', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted },
  logsNavButton: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.primary + '44',
    padding: spacing.md, marginTop: spacing.sm,
  },
  logsNavTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  logsNavSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  // Membros
  memberItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: borderRadius.sm, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.xs,
  },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '30', alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontWeight: '600', color: colors.text },
  memberEmail: { fontSize: 12, color: colors.textMuted },
  memberPosition: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  timeInput: { flex: 1, marginBottom: 0 },
  timeSeparator: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  roleChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  roleText: { fontSize: 11, fontWeight: '700' },
  // Chats
  chatConfigItem: {
    backgroundColor: colors.surface, borderRadius: borderRadius.sm,
    padding: spacing.md, marginBottom: spacing.xs, gap: 8,
  },
  chatConfigTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chatConfigLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  chatActions: { flexDirection: 'row', gap: 4 },
  chatActionBtn: { padding: 6 },
  hashIcon: { color: colors.textMuted, fontSize: 18, fontWeight: '700' },
  chatConfigName: { fontSize: 14, fontWeight: '600', color: colors.text },
  chatConfigType: { fontSize: 11, color: colors.textMuted },
  permToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
  },
  permToggleRestricted: { backgroundColor: (colors.warning ?? '#F59E0B') + '20' },
  permToggleOpen: { backgroundColor: (colors.success ?? '#10B981') + '20' },
  permToggleText: { fontSize: 12, fontWeight: '600' },
  chatMemberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  addMemberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, opacity: 0.85 },
  // Departamentos
  deptItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: borderRadius.sm, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.xs,
  },
  deptName: { fontSize: 14, fontWeight: '600', color: colors.text },
  deptSlug: { fontSize: 12, color: colors.textMuted },
  deptChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: borderRadius.sm,
    backgroundColor: colors.surface, marginRight: 6, borderWidth: 1, borderColor: colors.border,
  },
  deptChipActive: { backgroundColor: colors.primary + '18', borderColor: colors.primary },
  deptChipText: { color: colors.textSecondary, fontSize: 13 },
  deptChipTextActive: { color: colors.text, fontWeight: '600' },
  // Matriz de permissões
  permRow: { backgroundColor: colors.surface, borderRadius: borderRadius.sm, padding: spacing.md, marginBottom: spacing.xs },
  permSection: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 8 },
  permCols: { flexDirection: 'row', gap: 4 },
  permCol: { flex: 1, alignItems: 'center', gap: 3 },
  permColLabel: { fontSize: 9, fontWeight: '700', marginBottom: 2 },
  permNone: { fontSize: 11, color: colors.textMuted },
  permBadge: { backgroundColor: colors.backgroundLight, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  permBadgeText: { fontSize: 9, color: colors.textSecondary, fontWeight: '500' },
  emptyText: { textAlign: 'center', color: colors.textMuted, padding: spacing.lg },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: borderRadius.sm, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.sm,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  toggleSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalScroll: { maxHeight: '90%' },
  modalContent: { backgroundColor: colors.backgroundLight, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: spacing.lg, paddingBottom: spacing.xxl },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5, marginBottom: 5, marginTop: spacing.md, textTransform: 'uppercase' },
  modalInput: {
    backgroundColor: colors.surface, borderRadius: borderRadius.sm, padding: spacing.md,
    color: colors.text, fontSize: 15, borderWidth: 1, borderColor: colors.border,
  },
  roleSelector: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  roleSelectorItem: {
    flex: 1, paddingVertical: 10, borderRadius: borderRadius.sm,
    backgroundColor: colors.surface, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  roleSelectorItemActive: { backgroundColor: colors.primary + '18', borderColor: colors.primary },
  roleSelectorText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  modalCancelBtn: { flex: 1, padding: spacing.md, borderRadius: borderRadius.sm, backgroundColor: colors.surface, alignItems: 'center' },
  modalCancelText: { color: colors.textSecondary, fontWeight: '600', fontSize: 15 },
  modalSaveBtn: { flex: 1, padding: spacing.md, borderRadius: borderRadius.sm, backgroundColor: colors.primary, alignItems: 'center' },
  modalSaveText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  // Permissões de tela por usuário
  permScreenRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider ?? colors.border,
  },
  permScreenName: { fontSize: 13, fontWeight: '600', color: colors.text, flex: 1 },
  permLevelRow: { flexDirection: 'row', gap: 3 },
  permLevelBtn: {
    paddingHorizontal: 7, paddingVertical: 4, borderRadius: 5,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  permLevelBtnActive: { backgroundColor: colors.primary + '20', borderColor: colors.primary },
  permLevelText: { fontSize: 10, color: colors.textSecondary, fontWeight: '500' },
  permLevelTextActive: { color: colors.primary, fontWeight: '700' },
});

