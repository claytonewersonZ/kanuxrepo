import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, TextInput, Modal, Image, ActivityIndicator, Switch } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/lib/api';
import { ENV } from '../../src/lib/env';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing } from '../../src/theme';
import { useTheme, AppThemeMode } from '../../src/contexts/ThemeContext';

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { themeMode, setThemeMode, isDark } = useTheme();
  const router = useRouter();

  const isSuperAdmin = profile?.is_super_admin === true;

  // Estado do modal de edição
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState(profile?.display_name || '');
  const [editPhone, setEditPhone] = useState(profile?.phone || '');
  const [editPosition, setEditPosition] = useState(profile?.position || '');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  async function handlePickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Precisamos de acesso à galeria para escolher uma foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${profile?.id || 'user'}_${Date.now()}.${ext}`;
      const filePath = `avatars/${fileName}`;

      // Read file as blob for upload
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      // Upload using fetch to Supabase Storage REST API
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const supabaseUrl = ENV.SUPABASE_URL;

      const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/avatars/${fileName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': asset.mimeType || 'image/jpeg',
          'x-upsert': 'true',
        },
        body: blob,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(errText || 'Upload falhou');
      }

      // Build public URL
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${filePath}`;

      // Update profile with new avatar URL
      await api.updateProfile({ avatar_url: publicUrl });
      if (refreshProfile) await refreshProfile();
      Alert.alert('Sucesso', 'Foto de perfil atualizada!');
    } catch (error: any) {
      console.error('Erro ao fazer upload da foto:', error);
      Alert.alert('Erro', error.message || 'Falha ao fazer upload da foto');
    } finally {
      setUploadingPhoto(false);
    }
  }

  function openEditModal() {
    setEditName(profile?.display_name || '');
    setEditPhone(profile?.phone || '');
    setEditPosition(profile?.position || '');
    setShowEditModal(true);
  }

  async function handleSaveProfile() {
    if (!editName.trim()) {
      Alert.alert('Erro', 'O nome é obrigatório');
      return;
    }
    setSaving(true);
    try {
      await api.updateProfile({
        display_name: editName.trim(),
        phone: editPhone.trim() || undefined,
        position: editPosition.trim() || undefined,
      });
      if (refreshProfile) await refreshProfile();
      setShowEditModal(false);
      Alert.alert('Sucesso', 'Perfil atualizado com sucesso');
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      Alert.alert('Erro', 'Falha ao atualizar perfil');
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    Alert.alert(
      'Sair',
      'Tem certeza que deseja sair?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: async () => {
          await signOut();
          router.replace('/(auth)/login');
        }},
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handlePickAvatar} style={styles.avatarWrapper} disabled={uploadingPhoto}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Ionicons name="person" size={40} color={colors.text} />
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            {uploadingPhoto ? (
              <ActivityIndicator size={14} color={colors.text} />
            ) : (
              <Ionicons name="camera" size={14} color={colors.text} />
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.name}>{profile?.display_name || 'Usuário'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        {isSuperAdmin && (
          <View style={styles.adminBadge}>
            <Ionicons name="shield-checkmark" size={14} color={colors.text} />
            <Text style={styles.adminText}>Super Admin</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Informações do Perfil</Text>
        
        <View style={styles.infoItem}>
          <View style={styles.infoRow}>
            <Ionicons name="mail" size={20} color={colors.primary} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{user?.email}</Text>
            </View>
          </View>
        </View>
        
        <View style={styles.infoItem}>
          <View style={styles.infoRow}>
            <Ionicons name="person-circle" size={20} color={colors.primary} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Nome de Exibição</Text>
              <Text style={styles.infoValue}>{profile?.display_name || 'Não definido'}</Text>
            </View>
          </View>
        </View>

        {profile?.phone && (
          <View style={styles.infoItem}>
            <View style={styles.infoRow}>
              <Ionicons name="call" size={20} color={colors.primary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Telefone</Text>
                <Text style={styles.infoValue}>{profile.phone}</Text>
              </View>
            </View>
          </View>
        )}

        {profile?.position && (
          <View style={styles.infoItem}>
            <View style={styles.infoRow}>
              <Ionicons name="briefcase" size={20} color={colors.primary} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Cargo</Text>
                <Text style={styles.infoValue}>{profile.position}</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {isSuperAdmin && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Administração</Text>
          
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => router.push('/admin')}
          >
            <View style={styles.menuRow}>
              <View style={[styles.menuIcon, { backgroundColor: colors.warning + '30' }]}>
                <Ionicons name="settings" size={20} color={colors.warning} />
              </View>
              <Text style={styles.menuText}>Painel Admin</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => router.push('/company/select')}
          >
            <View style={styles.menuRow}>
              <View style={[styles.menuIcon, { backgroundColor: colors.primary + '30' }]}>
                <Ionicons name="business" size={20} color={colors.primary} />
              </View>
              <Text style={styles.menuText}>Gerenciar Empresas</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Conta</Text>
        
        <TouchableOpacity style={styles.menuItem} onPress={openEditModal}>
          <View style={styles.menuRow}>
            <View style={[styles.menuIcon, { backgroundColor: colors.info + '30' }]}>
              <Ionicons name="create" size={20} color={colors.info} />
            </View>
            <Text style={styles.menuText}>Editar Perfil</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Seção Aparência / Tema */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Aparência</Text>

        {/* Seleção Preto / Branco */}
        <View style={styles.themeRow}>
          <TouchableOpacity
            style={[styles.themeButton, themeMode === 'dark' && styles.themeButtonActive]}
            onPress={() => setThemeMode('dark')}
          >
            <View style={[styles.themeCircle, { backgroundColor: '#000000' }]}>
              {themeMode === 'dark' && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
            </View>
            <Text style={[styles.themeLabel, themeMode === 'dark' && styles.themeLabelActive]}>Preto</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.themeButton, themeMode === 'light' && styles.themeButtonActive]}
            onPress={() => setThemeMode('light')}
          >
            <View style={[styles.themeCircle, { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border }]}>
              {themeMode === 'light' && <Ionicons name="checkmark" size={18} color="#000000" />}
            </View>
            <Text style={[styles.themeLabel, themeMode === 'light' && styles.themeLabelActive]}>Branco</Text>
          </TouchableOpacity>
        </View>

        {/* Toggle Auto-Tema */}
        <View style={styles.autoThemeRow}>
          <View style={styles.autoThemeInfo}>
            <Ionicons name="partly-sunny" size={20} color={colors.warning} />
            <View>
              <Text style={styles.autoThemeLabel}>Desligar Auto-Tema</Text>
              <Text style={styles.autoThemeHint}>Tema automático muda com o clima</Text>
            </View>
          </View>
          <Switch
            value={themeMode !== 'auto'}
            onValueChange={(val) => {
              if (!val) setThemeMode('auto');
              else setThemeMode(isDark ? 'dark' : 'light');
            }}
            trackColor={{ false: colors.primary + '80', true: colors.border }}
            thumbColor={themeMode !== 'auto' ? colors.text : colors.primary}
          />
        </View>
      </View>

      <TouchableOpacity
        style={styles.signOutButton}
        onPress={handleSignOut}
      >
        <Ionicons name="log-out" size={20} color={colors.text} />
        <Text style={styles.signOutText}>Sair</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Versão 1.0.1</Text>

      {/* Modal de Edição de Perfil */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Editar Perfil</Text>

            <Text style={styles.fieldLabel}>Nome de Exibição</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Seu nome"
              placeholderTextColor={colors.textMuted}
              value={editName}
              onChangeText={setEditName}
              autoFocus
            />

            <Text style={styles.fieldLabel}>Telefone</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="(00) 00000-0000"
              placeholderTextColor={colors.textMuted}
              value={editPhone}
              onChangeText={setEditPhone}
              keyboardType="phone-pad"
            />

            <Text style={styles.fieldLabel}>Cargo</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: Desenvolvedor, Gerente..."
              placeholderTextColor={colors.textMuted}
              value={editPosition}
              onChangeText={setEditPosition}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveButton, saving && { opacity: 0.5 }]}
                onPress={handleSaveProfile}
                disabled={saving}
              >
                <Text style={styles.modalSaveText}>{saving ? 'Salvando...' : 'Salvar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
  header: { alignItems: 'center', paddingVertical: spacing.xl },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarWrapper: { position: 'relative' as const, marginBottom: spacing.md },
  avatarEditBadge: { position: 'absolute' as const, bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background },
  name: { fontSize: 24, fontWeight: 'bold', color: colors.text },
  email: { fontSize: 14, color: colors.textSecondary, marginTop: spacing.xs },
  adminBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.warning, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 16, marginTop: spacing.sm, gap: spacing.xs },
  adminText: { fontSize: 12, color: colors.text, fontWeight: '600' },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm, textTransform: 'uppercase' },
  infoItem: { backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, marginBottom: spacing.sm },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 12, color: colors.textSecondary },
  infoValue: { fontSize: 16, color: colors.text, fontWeight: '500' },
  menuItem: { backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  menuIcon: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  menuText: { fontSize: 16, color: colors.text },
  signOutButton: { backgroundColor: colors.error, borderRadius: 8, padding: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, gap: spacing.sm },
  signOutText: { fontSize: 16, color: colors.text, fontWeight: '600' },
  version: { textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: spacing.lg, marginBottom: spacing.xl },
  // Modal de edição
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.backgroundLight, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, paddingBottom: spacing.xl },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text, marginBottom: spacing.lg },
  fieldLabel: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.xs },
  modalInput: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, color: colors.text, fontSize: 16, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  modalCancelButton: { flex: 1, padding: spacing.md, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center' },
  modalCancelText: { color: colors.textSecondary, fontWeight: '600', fontSize: 16 },
  modalSaveButton: { flex: 1, padding: spacing.md, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center' },
  modalSaveText: { color: colors.text, fontWeight: '600', fontSize: 16 },
  // Tema / Aparência
  themeRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  themeButton: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 12,
    padding: spacing.md, alignItems: 'center', gap: spacing.sm,
    borderWidth: 2, borderColor: 'transparent',
  },
  themeButtonActive: { borderColor: colors.primary },
  themeCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  themeLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  themeLabelActive: { color: colors.text, fontWeight: '700' },
  autoThemeRow: {
    backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  autoThemeInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  autoThemeLabel: { fontSize: 15, color: colors.text, fontWeight: '500' },
  autoThemeHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});

