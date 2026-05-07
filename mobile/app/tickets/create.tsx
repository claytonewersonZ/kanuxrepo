import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { getUserCompanies, createTicket, Company, getDepartments, Department, getCompanyMembers, Profile } from '../../src/lib/supabase';
import { getUserCompany, saveUserCompany } from '../../src/lib/offlineStorage';
import { colors, spacing, borderRadius } from '../../src/theme';
import { getWorkingHoursRestrictionMessage } from '../../src/lib/workingHours';
import { useWebSocket } from '../../src/contexts/WebSocketContext';

export default function CreateTicketScreen() {
  const { profile } = useAuth();
  const { createTicketWs, isConnected } = useWebSocket();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState<string>('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [loadingCompany, setLoadingCompany] = useState(true);
  const workingHoursMessage = getWorkingHoursRestrictionMessage(profile, 'abrir chamados');
  const blockedByWorkingHours = !!workingHoursMessage;

  useEffect(() => {
    (async () => {
      try {
        const companiesData = await getUserCompanies();
        setCompanies(companiesData);
        const savedId = await getUserCompany();
        const valid = companiesData.find(c => c.id === savedId);
        const activeId = valid ? savedId! : companiesData[0]?.id || '';
        setCompanyId(activeId);
        if (activeId && !valid) await saveUserCompany(activeId);
        if (activeId) {
          const [depts, mems] = await Promise.all([
            getDepartments(activeId),
            getCompanyMembers(activeId),
          ]);
          setDepartments(depts);
          setMembers(mems);
        }
      } catch (error) {
        console.error('Error loading data for ticket creation:', error);
      } finally {
        setLoadingCompany(false);
      }
    })();
  }, []);

  async function handleCompanyChange(cId: string) {
    setCompanyId(cId);
    setSelectedDepartmentId('');
    setSelectedUserId('');
    await saveUserCompany(cId);
    try {
      const [depts, mems] = await Promise.all([
        getDepartments(cId),
        getCompanyMembers(cId),
      ]);
      setDepartments(depts);
      setMembers(mems);
    } catch {}
  }

  async function handleCreate() {
    if (blockedByWorkingHours) {
      Alert.alert('Fora do horário', workingHoursMessage); return;
    }
    if (!title.trim()) { Alert.alert('Erro', 'Informe o título do chamado'); return; }
    if (!companyId) { Alert.alert('Erro', 'Nenhuma empresa encontrada'); return; }
    if (!selectedDepartmentId) { Alert.alert('Erro', 'Selecione o departamento (obrigatório)'); return; }

    setLoading(true);

    // Tenta criar via WebSocket primeiro
    if (isConnected) {
      const wsPayload = {
        companyId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        departmentId: selectedDepartmentId || undefined,
        assigneeProfileId: selectedUserId || undefined,
      };
      const sent = createTicketWs(wsPayload, (result) => {
        setLoading(false);
        if (result.success) {
          Alert.alert('Sucesso', 'Chamado criado com sucesso!', [{ text: 'OK', onPress: () => router.back() }]);
        } else {
          Alert.alert('Erro', result.error || 'Falha ao criar chamado');
        }
      });
      if (sent) return;
    }

    // Fallback REST
    try {
      const ticket = await createTicket(companyId, title.trim(), description.trim(), priority, selectedDepartmentId || undefined);
      if (ticket) {
        Alert.alert('Sucesso', 'Chamado criado com sucesso!', [{ text: 'OK', onPress: () => router.back() }]);
      }
    } catch (error) {
      console.error('Error creating ticket:', error);
      Alert.alert('Erro', 'Falha ao criar chamado');
    } finally {
      setLoading(false);
    }
  }

  const priorities = [
    { value: 'LOW', label: 'Baixa', color: colors.priorityLow, icon: 'arrow-down' as const },
    { value: 'MEDIUM', label: 'Média', color: colors.priorityMedium, icon: 'remove' as const },
    { value: 'HIGH', label: 'Alta', color: colors.priorityHigh, icon: 'arrow-up' as const },
  ];

  // Filter manager/admin members for targeting
  const targetMembers = members.filter(m => {
    // Show all members for targeting
    return true;
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.form}>

        {/* Company Selector */}
        {companies.length > 1 && (
          <>
            <Text style={styles.label}>EMPRESA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {companies.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chip, companyId === c.id && styles.chipActive]}
                  onPress={() => handleCompanyChange(c.id)}
                >
                  <Text style={[styles.chipText, companyId === c.id && styles.chipTextActive]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Title */}
        <Text style={styles.label}>TÍTULO *</Text>
        <TextInput
          style={styles.input}
          placeholder="Descreva o problema brevemente"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
          maxLength={200}
        />

        {/* Description */}
        <Text style={styles.label}>DESCRIÇÃO</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Detalhes adicionais sobre o problema..."
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />

        {/* Department - REQUIRED */}
        <Text style={styles.label}>
          DEPARTAMENTO * <Text style={styles.requiredNote}>(obrigatório)</Text>
        </Text>
        <View style={styles.optionsList}>
          {departments.length === 0 && (
            <Text style={styles.emptyHint}>Nenhum departamento disponível</Text>
          )}
          {departments.map(dept => (
            <TouchableOpacity
              key={dept.id}
              style={[styles.optionItem, selectedDepartmentId === dept.id && styles.optionItemActive]}
              onPress={() => setSelectedDepartmentId(dept.id)}
            >
              <Ionicons
                name="folder"
                size={18}
                color={selectedDepartmentId === dept.id ? colors.primary : colors.textMuted}
              />
              <Text style={[styles.optionText, selectedDepartmentId === dept.id && styles.optionTextActive]}>
                {dept.name}
              </Text>
              {selectedDepartmentId === dept.id && (
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* User Target - OPTIONAL */}
        <Text style={styles.label}>
          DIRECIONAR PARA USUÁRIO <Text style={styles.optionalNote}>(opcional)</Text>
        </Text>
        <View style={styles.optionsList}>
          <TouchableOpacity
            style={[styles.optionItem, !selectedUserId && styles.optionItemActive]}
            onPress={() => setSelectedUserId('')}
          >
            <Ionicons name="people" size={18} color={!selectedUserId ? colors.primary : colors.textMuted} />
            <Text style={[styles.optionText, !selectedUserId && styles.optionTextActive]}>Qualquer atendente</Text>
            {!selectedUserId && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
          </TouchableOpacity>
          {targetMembers.map(member => (
            <TouchableOpacity
              key={member.id}
              style={[styles.optionItem, selectedUserId === member.id && styles.optionItemActive]}
              onPress={() => setSelectedUserId(member.id)}
            >
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>
                  {(member.display_name || 'U').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionText, selectedUserId === member.id && styles.optionTextActive]}>
                  {member.display_name || 'Sem nome'}
                </Text>
                {member.position && <Text style={styles.memberPosition}>{member.position}</Text>}
              </View>
              {selectedUserId === member.id && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Priority */}
        <Text style={styles.label}>PRIORIDADE</Text>
        <View style={styles.priorityContainer}>
          {priorities.map((p) => (
            <TouchableOpacity
              key={p.value}
              style={[styles.priorityButton, priority === p.value && { backgroundColor: p.color, borderColor: p.color }]}
              onPress={() => setPriority(p.value as 'LOW' | 'MEDIUM' | 'HIGH')}
            >
              <Ionicons name={p.icon} size={16} color={priority === p.value ? colors.text : p.color} />
              <Text style={[styles.priorityText, priority === p.value && styles.priorityTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleCreate}
          disabled={loading || blockedByWorkingHours}
        >
          {loading ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="send" size={18} color={colors.text} />
              <Text style={styles.submitButtonText}>Abrir Chamado</Text>
            </View>
          )}
        </TouchableOpacity>
        {blockedByWorkingHours && <Text style={styles.emptyHint}>{workingHoursMessage}</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  form: { flex: 1 },
  label: {
    fontSize: 11, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.lg,
    textTransform: 'uppercase',
  },
  requiredNote: { color: colors.error, fontSize: 10, fontWeight: '600' },
  optionalNote: { color: colors.textMuted, fontSize: 10, fontWeight: '500' },
  input: {
    backgroundColor: colors.surface, borderRadius: borderRadius.sm,
    padding: spacing.md, color: colors.text, fontSize: 15,
    borderWidth: 1, borderColor: colors.border,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  chipScroll: { marginBottom: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm,
  },
  chipActive: { backgroundColor: colors.primary + '18', borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 14, fontWeight: '500' },
  chipTextActive: { color: colors.text },
  optionsList: {
    backgroundColor: colors.surface, borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  optionItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: spacing.md,
    gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  optionItemActive: { backgroundColor: colors.primary + '12' },
  optionText: { flex: 1, fontSize: 15, color: colors.textSecondary, fontWeight: '500' },
  optionTextActive: { color: colors.text },
  emptyHint: { padding: spacing.md, color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  memberAvatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  memberPosition: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  priorityContainer: { flexDirection: 'row', gap: spacing.sm },
  priorityButton: {
    flex: 1, paddingVertical: 12, borderRadius: borderRadius.sm,
    backgroundColor: colors.surface, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  priorityText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
  priorityTextActive: { color: colors.text },
  submitButton: {
    backgroundColor: colors.primary, borderRadius: borderRadius.sm,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.xl,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
});

