import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Platform, StatusBar } from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { getUserCompanies, getCompanyTickets, Company, Ticket } from '../../src/lib/supabase';
import { saveUserCompany, getUserCompany } from '../../src/lib/offlineStorage';
import { api } from '../../src/lib/api';
import { colors, spacing, borderRadius } from '../../src/theme';
import KanuxLogo from '../../src/components/KanuxLogo';

export default function HomeScreen() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [recentTickets, setRecentTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdminOrAbove, setIsAdminOrAbove] = useState(false);

  const isSuperAdmin = profile?.is_super_admin === true;

  async function loadData() {
    try {
      const companiesData = await getUserCompanies();
      setCompanies(companiesData);

      let companyList = companiesData;
      if (isSuperAdmin) {
        const { supabase } = await import('../../src/lib/supabase');
        const { data: allData } = await supabase.from('companies').select('*').order('name');
        companyList = allData || companiesData;
        setAllCompanies(companyList);
      }

      const availableCompanies = isSuperAdmin ? companyList : companiesData;

      if (availableCompanies.length > 0) {
        const savedId = await getUserCompany();
        const valid = availableCompanies.find(c => c.id === savedId);
        const active = valid || availableCompanies[0];
        setSelectedCompany(active);
        if (!valid) await saveUserCompany(active.id);
        const ticketsData = await getCompanyTickets(active.id);
        setRecentTickets(ticketsData.slice(0, 5));

        // Check if user is ADMIN or SUPER_ADMIN in any company
        if (!isSuperAdmin) {
          try {
            const membersRes = await api.getCompanyMembers(active.id);
            const myMem = (membersRes?.data || []).find((m: any) => m.user_profile_id === profile?.id);
            if (myMem && ['ADMIN', 'SUPER_ADMIN'].includes(String(myMem.role))) {
              setIsAdminOrAbove(true);
            }
          } catch { /* ignore */ }
        } else {
          setIsAdminOrAbove(true);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!user || !profile) { setLoading(false); return; }
    loadData();
  }, [user, profile?.is_super_admin]);

  function onRefresh() {
    if (!user || !profile) return;
    setRefreshing(true); loadData();
  }

  async function handleSelectCompany(company: Company) {
    setSelectedCompany(company);
    await saveUserCompany(company.id);
    const ticketsData = await getCompanyTickets(company.id);
    setRecentTickets(ticketsData.slice(0, 5));
  }

  const openTickets = recentTickets.filter(t => t.status === 'OPEN').length;
  const pendingTickets = recentTickets.filter(t => t.status === 'PENDING').length;
  const resolvedTickets = recentTickets.filter(t => t.status === 'RESOLVED').length;

  const displayCompanies = isSuperAdmin ? (allCompanies.length > 0 ? allCompanies : companies) : companies;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.surface} />
      
      {/* Discord-style Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <KanuxLogo size="sm" showText={false} />
          <View>
            <Text style={styles.headerTitle}>Kanux</Text>
            <Text style={styles.headerSubtitle}>
              {isSuperAdmin ? 'Super Admin' : (profile?.position || 'Membro')}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.headerAvatar} onPress={() => router.push('/(tabs)/profile')}>
          <Text style={styles.headerAvatarText}>
            {(profile?.display_name || user?.email || 'U').charAt(0).toUpperCase()}
          </Text>
          <View style={styles.onlineIndicator} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Greeting */}
        <View style={styles.greetingSection}>
          <Text style={styles.greeting}>Olá, {profile?.display_name || user?.email?.split('@')[0] || 'Usuário'}</Text>
          <Text style={styles.greetingSub}>O que deseja fazer hoje?</Text>
        </View>

        {/* Company Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {isSuperAdmin ? 'EMPRESAS (TODAS)' : 'SUA EMPRESA'}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {displayCompanies.map((company) => (
              <TouchableOpacity
                key={company.id}
                style={[styles.companyPill, selectedCompany?.id === company.id && styles.companyPillActive]}
                onPress={() => handleSelectCompany(company)}
              >
                <View style={[styles.companyIcon, selectedCompany?.id === company.id && styles.companyIconActive]}>
                  <Text style={styles.companyInitial}>{company.name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={[styles.companyPillText, selectedCompany?.id === company.id && styles.companyPillTextActive]} numberOfLines={1}>
                  {company.name}
                </Text>
                {selectedCompany?.id === company.id && <View style={styles.selectedDot} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Stats */}
        {selectedCompany && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>RESUMO — {selectedCompany.name.toUpperCase()}</Text>
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { borderLeftColor: colors.primary }]}>
                <Ionicons name="alert-circle" size={20} color={colors.primary} />
                <Text style={styles.statNumber}>{openTickets}</Text>
                <Text style={styles.statLabel}>Abertos</Text>
              </View>
              <View style={[styles.statCard, { borderLeftColor: colors.warning }]}>
                <Ionicons name="time" size={20} color={colors.warning} />
                <Text style={styles.statNumber}>{pendingTickets}</Text>
                <Text style={styles.statLabel}>Pendentes</Text>
              </View>
              <View style={[styles.statCard, { borderLeftColor: colors.success }]}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={styles.statNumber}>{resolvedTickets}</Text>
                <Text style={styles.statLabel}>Resolvidos</Text>
              </View>
            </View>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>AÇÕES RÁPIDAS</Text>
          <View style={styles.channelList}>
            <TouchableOpacity style={styles.channelItem} onPress={() => router.push('/tickets/create')}>
              <Ionicons name="add-circle" size={20} color={colors.success} />
              <Text style={styles.channelText}>Abrir Chamado</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.channelItem} onPress={() => router.push('/(tabs)/chats')}>
              <Ionicons name="chatbubbles" size={20} color={colors.primary} />
              <Text style={styles.channelText}>Ver Chats</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.channelItem} onPress={() => router.push('/(tabs)/tickets')}>
              <Ionicons name="ticket" size={20} color={colors.warning} />
              <Text style={styles.channelText}>Meus Tickets</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
            {(isSuperAdmin || isAdminOrAbove) && (
              <TouchableOpacity style={styles.channelItem} onPress={() => router.push('/admin')}>
                <Ionicons name="shield-checkmark" size={20} color={colors.error} />
                <Text style={styles.channelText}>Painel Admin</Text>
                <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>ADMIN</Text></View>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Recent Tickets */}
        {recentTickets.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>TICKETS RECENTES</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/tickets')}>
                <Text style={styles.seeAll}>Ver todos</Text>
              </TouchableOpacity>
            </View>
            {recentTickets.map((ticket) => (
              <TouchableOpacity
                key={ticket.id}
                style={styles.ticketItem}
                onPress={() => router.push(`/ticket/${ticket.id}`)}
              >
                <View style={[styles.ticketDot, { backgroundColor: getStatusColor(ticket.status) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.ticketTitle} numberOfLines={1}>{ticket.title}</Text>
                  <Text style={styles.ticketMeta}>#{ticket.number || ticket.id.slice(0, 8)} · {getStatusLabel(ticket.status)}</Text>
                </View>
                <View style={[styles.priorityDot, { backgroundColor: getPriorityColor(ticket.priority) }]} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

function getStatusColor(status: string) {
  switch (status) {
    case 'OPEN': return colors.primary;
    case 'PENDING': return colors.warning;
    case 'RESOLVED': return colors.success;
    case 'CLOSED': return colors.textMuted;
    default: return colors.textMuted;
  }
}
function getStatusLabel(status: string) {
  switch (status) {
    case 'OPEN': return 'Aberto';
    case 'PENDING': return 'Pendente';
    case 'RESOLVED': return 'Resolvido';
    case 'CLOSED': return 'Fechado';
    default: return status;
  }
}
function getPriorityColor(priority: string) {
  switch (priority?.toUpperCase()) {
    case 'HIGH': return colors.error;
    case 'MEDIUM': return colors.warning;
    case 'LOW': return colors.success;
    default: return colors.textMuted;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingTop: Platform.OS === 'ios' ? 56 : 12, paddingBottom: 12,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  headerSubtitle: { fontSize: 12, color: colors.textMuted },
  headerAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  headerAvatarText: { color: colors.text, fontWeight: '700', fontSize: 16 },
  onlineIndicator: {
    position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.success, borderWidth: 2, borderColor: colors.surface,
  },
  content: { paddingBottom: spacing.lg },
  greetingSection: { padding: spacing.md, paddingTop: spacing.lg },
  greeting: { fontSize: 22, fontWeight: '700', color: colors.text },
  greetingSub: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  section: { paddingHorizontal: spacing.md, marginTop: spacing.lg },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5, marginBottom: spacing.sm, textTransform: 'uppercase' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  seeAll: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  companyPill: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: borderRadius.md, paddingVertical: 8, paddingHorizontal: 12,
    marginRight: spacing.sm, gap: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  companyPillActive: { backgroundColor: colors.primary + '18', borderColor: colors.primary },
  companyIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.surfaceLight, alignItems: 'center', justifyContent: 'center' },
  companyIconActive: { backgroundColor: colors.primary },
  companyInitial: { color: colors.text, fontWeight: '700', fontSize: 14 },
  companyPillText: { color: colors.textSecondary, fontSize: 14, fontWeight: '500', maxWidth: 100 },
  companyPillTextActive: { color: colors.text },
  selectedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginLeft: 4 },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.sm, padding: spacing.md, alignItems: 'center', gap: 4, borderLeftWidth: 3 },
  statNumber: { fontSize: 22, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted },
  channelList: { backgroundColor: colors.surface, borderRadius: borderRadius.sm, overflow: 'hidden' },
  channelItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  channelText: { flex: 1, fontSize: 15, color: colors.textSecondary, fontWeight: '500' },
  adminBadge: { backgroundColor: colors.error + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  adminBadgeText: { fontSize: 10, color: colors.error, fontWeight: '700' },
  ticketItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.sm, padding: spacing.md, marginBottom: spacing.xs, gap: spacing.sm },
  ticketDot: { width: 8, height: 8, borderRadius: 4 },
  ticketTitle: { fontSize: 15, color: colors.text, fontWeight: '500' },
  ticketMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  priorityDot: { width: 10, height: 10, borderRadius: 5 },
});

