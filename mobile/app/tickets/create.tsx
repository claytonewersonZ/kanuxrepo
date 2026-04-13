import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { getUserCompanies, createTicket } from '../../src/lib/supabase';
import { colors, spacing } from '../../src/theme';

export default function CreateTicketScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState<string>('');
  const [loadingCompany, setLoadingCompany] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const companies = await getUserCompanies();
        if (companies.length > 0) {
          setCompanyId(companies[0].id);
        }
      } catch (error) {
        console.error('Error loading companies for ticket creation:', error);
      } finally {
        setLoadingCompany(false);
      }
    })();
  }, []);

  async function handleCreate() {
    if (!title.trim()) {
      Alert.alert('Erro', 'Por favor, insira um título');
      return;
    }

    if (!companyId) {
      Alert.alert('Erro', 'Nenhuma empresa encontrada. Entre em contato com o administrador.');
      return;
    }

    setLoading(true);
    try {
      const ticket = await createTicket(
        companyId,
        title.trim(),
        description.trim(),
        priority
      );

      if (ticket) {
        Alert.alert('Sucesso', 'Ticket criado com sucesso!', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      }
    } catch (error) {
      console.error('Error creating ticket:', error);
      Alert.alert('Erro', 'Falha ao criar ticket');
    } finally {
      setLoading(false);
    }
  }

  const priorities = [
    { value: 'LOW', label: 'Baixa', color: colors.priorityLow },
    { value: 'MEDIUM', label: 'Média', color: colors.priorityMedium },
    { value: 'HIGH', label: 'Alta', color: colors.priorityHigh },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.form}>
        <Text style={styles.label}>Título *</Text>
        <TextInput
          style={styles.input}
          placeholder="Digite o título do ticket"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={setTitle}
          maxLength={200}
        />

        <Text style={styles.label}>Descrição</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Descreva o problema ou solicitação"
          placeholderTextColor={colors.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />

        <Text style={styles.label}>Prioridade</Text>
        <View style={styles.priorityContainer}>
          {priorities.map((p) => (
            <TouchableOpacity
              key={p.value}
              style={[
                styles.priorityButton,
                priority === p.value && { backgroundColor: p.color },
              ]}
              onPress={() => setPriority(p.value as 'LOW' | 'MEDIUM' | 'HIGH')}
            >
              <Text
                style={[
                  styles.priorityText,
                  priority === p.value && styles.priorityTextActive,
                ]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          <Text style={styles.submitButtonText}>
            {loading ? 'Criando...' : 'Criar Ticket'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
  },
  form: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    color: colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  priorityContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  priorityButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  priorityText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  priorityTextActive: {
    color: colors.text,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

