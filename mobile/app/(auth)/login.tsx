import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StatusBar,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { api, initApi, setAuthToken } from '../../src/lib/api';
import { colors, spacing, borderRadius, shadows } from '../../src/theme';
import KanuxLogo from '../../src/components/KanuxLogo';

export default function LoginScreen() {
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [companySlug, setCompanySlug] = useState('');
  const [loading, setLoading]         = useState(false);
  const [isSignUp, setIsSignUp]       = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  useEffect(() => { initApi().catch(() => {}); }, []);

  async function handleAuth() {
    if (!email || !password) { Alert.alert('Erro', 'Preencha todos os campos'); return; }
    if (!isSignUp && !companySlug) { Alert.alert('Erro', 'Informe o número da empresa'); return; }
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        Alert.alert('Sucesso', 'Conta criada! Verifique seu email.');
      } else {
        const result = await api.verifyCompany(companySlug.trim());
        if (!result.success) { Alert.alert('Erro', result.error || 'Empresa não encontrada'); return; }
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.session?.access_token) setAuthToken(data.session.access_token);
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Erro ao autenticar');
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : (StatusBar.currentHeight ?? 0)}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <KanuxLogo size="lg" />
          <Text style={styles.subtitle}>{isSignUp ? 'Crie sua conta' : 'Bem-vindo de volta'}</Text>
        </View>
        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput style={styles.inputWithIcon} placeholder="seu@email.com" placeholderTextColor={colors.textMuted}
                value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
            </View>
          </View>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Senha</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput style={styles.inputWithIcon} placeholder="********" placeholderTextColor={colors.textMuted}
                value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCorrect={false} autoComplete="off" />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
          {!isSignUp && (
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Número da Empresa</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="business-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput style={styles.inputWithIcon} placeholder="1000" placeholderTextColor={colors.textMuted}
                  value={companySlug} onChangeText={setCompanySlug} keyboardType="numeric" autoCorrect={false} />
              </View>
            </View>
          )}
          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleAuth} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color={colors.text} />
              : (
                <View style={styles.buttonContent}>
                  <Ionicons name={isSignUp ? 'person-add' : 'log-in'} size={20} color={colors.text} />
                  <Text style={styles.buttonText}>{isSignUp ? 'Criar Conta' : 'Entrar'}</Text>
                </View>
              )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkButton} onPress={() => setIsSignUp(!isSignUp)}>
            <Text style={styles.linkText}>
              {isSignUp ? 'Já tem uma conta? Entre' : 'Não tem conta? Cadastre-se'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.footer}>© 2025 Kanux - Help Desk</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.background },
  scrollContent:  { flexGrow: 1, padding: spacing.lg, justifyContent: 'center' },
  header:         { alignItems: 'center', marginBottom: spacing.xl },
  subtitle:       { fontSize: 16, color: colors.textSecondary, marginTop: spacing.lg },
  form:           { width: '100%' },
  inputContainer: { marginBottom: spacing.md },
  inputLabel:     { fontSize: 14, fontWeight: '500', color: colors.textSecondary, marginBottom: spacing.xs },
  inputWrapper:   { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border },
  inputIcon:      { paddingLeft: spacing.md },
  inputWithIcon:  { flex: 1, padding: spacing.md, color: colors.text, fontSize: 16 },
  eyeButton:      { padding: spacing.md },
  button:         { backgroundColor: colors.primary, borderRadius: borderRadius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg, ...shadows.brand },
  buttonDisabled: { opacity: 0.6 },
  buttonContent:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buttonText:     { color: colors.text, fontSize: 18, fontWeight: '600' },
  linkButton:     { marginTop: spacing.lg, alignItems: 'center', padding: spacing.sm },
  linkText:       { color: colors.primary, fontSize: 15, fontWeight: '500' },
  footer:         { textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: spacing.xxl },
});
