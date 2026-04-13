import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Modal, FlatList, Alert } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, spacing } from '../../src/theme';
import { useOfflineMessages } from '../../src/contexts/SyncContext';
import { getChatTyping, setChatTyping, getChatMembersForChat, addMemberToChat, removeMemberFromChat, getCompanyMembers, ChatMember, Chat } from '../../src/lib/supabase';
import { api } from '../../src/lib/api';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [remoteTyping, setRemoteTyping] = useState<string[]>([]);
  const typingTimer = useRef<any>(null);

  // Membros do chat
  const [chatMembers, setChatMembers] = useState<ChatMember[]>([]);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [companyMembers, setCompanyMembers] = useState<any[]>([]);
  const [chatInfo, setChatInfo] = useState<Chat | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const { messages, loading, sendMessage, refresh } = useOfflineMessages(id as string);

  // Carregar info do chat e membros
  useEffect(() => {
    if (!id) return;
    loadChatInfo();
    loadMembers();
  }, [id]);

  async function loadChatInfo() {
    try {
      const result = await api.getChats(undefined);
      // Buscar chat específico pela API
      const chatResult = await api.getChats();
      if (chatResult?.data) {
        const found = (chatResult.data as Chat[]).find(c => c.id === id);
        if (found) setChatInfo(found);
      }
    } catch (e) {
      console.error('Erro ao carregar info do chat:', e);
    }
  }

  async function loadMembers() {
    if (!id) return;
    setLoadingMembers(true);
    try {
      const members = await getChatMembersForChat(id);
      setChatMembers(members);
    } catch (e) {
      console.error('Erro ao carregar membros:', e);
    } finally {
      setLoadingMembers(false);
    }
  }

  async function openMembersModal() {
    setShowMembersModal(true);
    // Carregar membros da empresa para adicionar
    if (chatInfo?.company_id) {
      try {
        const members = await getCompanyMembers(chatInfo.company_id);
        setCompanyMembers(members);
      } catch (e) {
        console.error('Erro ao carregar membros da empresa:', e);
      }
    }
  }

  async function handleAddMember(userProfileId: string) {
    if (!id) return;
    const result = await addMemberToChat(id, userProfileId);
    if (result) {
      Alert.alert('Sucesso', 'Membro adicionado ao chat');
      loadMembers();
    } else {
      Alert.alert('Erro', 'Falha ao adicionar membro');
    }
  }

  async function handleRemoveMember(userProfileId: string) {
    if (!id) return;
    Alert.alert('Remover Membro', 'Tem certeza que deseja remover este membro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        const ok = await removeMemberFromChat(id, userProfileId);
        if (ok) {
          loadMembers();
        } else {
          Alert.alert('Erro', 'Falha ao remover membro');
        }
      }},
    ]);
  }

  // Verificar se um membro da empresa já está no chat
  function isMemberInChat(userProfileId: string) {
    return chatMembers.some(cm => cm.user_profile_id === userProfileId);
  }

  // Status de digitação
  useEffect(() => {
    if (!id) return;
    let mounted = true;
    const fetchTyping = async () => {
      try {
        const t = await getChatTyping(id as string);
        if (!mounted) return;
        const names = (t || [])
          .filter((u: any) => u.user_profile_id !== user?.id)
          .map((u: any) => u.display_name || 'Alguém');
        setRemoteTyping(names);
      } catch (e) {
        console.error('Erro ao buscar status de digitação:', e);
      }
    };

    fetchTyping();
    const interval = setInterval(fetchTyping, 1500);
    return () => { mounted = false; clearInterval(interval); };
  }, [id, user?.id]);

  async function handleSend() {
    if (!newMessage.trim() || !id || sending) return;

    setSending(true);
    try {
      try { await setChatTyping(id as string, false); } catch {}

      const sentMessage = await sendMessage(newMessage.trim());
      if (sentMessage) {
        setNewMessage('');
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Barra de informações do chat */}
      <View style={styles.chatHeader}>
        <View style={styles.chatHeaderInfo}>
          <Text style={styles.chatHeaderName}>{chatInfo?.name || 'Chat'}</Text>
          <Text style={styles.chatHeaderSub}>
            {chatInfo?.is_private ? '🔒 Privado' : '# Público'} • {chatMembers.length} membros
          </Text>
        </View>
        <TouchableOpacity style={styles.membersButton} onPress={openMembersModal}>
          <Ionicons name="people" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.messageList} contentContainerStyle={styles.messageContent}>
        {messages.length === 0 && !loading && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Nenhuma mensagem ainda</Text>
            <Text style={styles.emptySubtext}>Envie uma mensagem para começar a conversa</Text>
          </View>
        )}
        {messages.map((item) => {
          const isMyMessage = item.user_profile_id === user?.id;
          return (
            <View 
              key={item.id}
              style={[styles.messageBubble, isMyMessage ? styles.myMessage : styles.otherMessage]}
            >
              <Text style={styles.messageText}>{item.content}</Text>
              <Text style={styles.messageTime}>
                {new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              {item.pending && (
                <Text style={styles.pendingText}>Enviando...</Text>
              )}
            </View>
          );
        })}
        {remoteTyping.length > 0 && (
          <View style={styles.typingIndicator}>
            <Text style={styles.typingText}>{`${remoteTyping.join(', ')} está digitando...`}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Digite sua mensagem..."
          placeholderTextColor={colors.textMuted}
          value={newMessage}
          onChangeText={(text) => {
            setNewMessage(text);
            if (!id) return;
            try { setChatTyping(id as string, true); } catch (e) { }
            if (typingTimer.current) clearTimeout(typingTimer.current);
            typingTimer.current = setTimeout(() => { try { setChatTyping(id as string, false); } catch (e) {} }, 1500);
          }}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!newMessage.trim() || sending}
        >
          <Text style={styles.sendButtonText}>Enviar</Text>
        </TouchableOpacity>
      </View>

      {/* Modal de Membros */}
      <Modal visible={showMembersModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Membros do Chat</Text>
              <TouchableOpacity onPress={() => setShowMembersModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Lista de membros atuais */}
            <Text style={styles.sectionLabel}>Membros Atuais ({chatMembers.length})</Text>
            {chatMembers.length === 0 && (
              <Text style={styles.emptyMembersText}>Nenhum membro adicionado</Text>
            )}
            {chatMembers.map(member => (
              <View key={member.id} style={styles.memberItem}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>
                    {(member.user_profile?.display_name || 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.user_profile?.display_name || 'Sem nome'}</Text>
                  <Text style={styles.memberEmail}>{member.user_profile?.email || ''}</Text>
                </View>
                <TouchableOpacity
                  style={styles.removeMemberButton}
                  onPress={() => handleRemoveMember(member.user_profile_id)}
                >
                  <Ionicons name="close-circle" size={22} color={colors.error} />
                </TouchableOpacity>
              </View>
            ))}

            {/* Adicionar membros */}
            <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Adicionar Membro</Text>
            <ScrollView style={styles.addMemberList}>
              {companyMembers
                .filter(m => !isMemberInChat(m.id))
                .map(member => (
                  <TouchableOpacity
                    key={member.id}
                    style={styles.memberItem}
                    onPress={() => handleAddMember(member.id)}
                  >
                    <View style={[styles.memberAvatar, { backgroundColor: colors.success }]}>
                      <Text style={styles.memberAvatarText}>
                        {(member.display_name || 'U').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{member.display_name || 'Sem nome'}</Text>
                      <Text style={styles.memberEmail}>{member.email || ''}</Text>
                    </View>
                    <Ionicons name="add-circle" size={22} color={colors.success} />
                  </TouchableOpacity>
                ))}
              {companyMembers.filter(m => !isMemberInChat(m.id)).length === 0 && (
                <Text style={styles.emptyMembersText}>Todos os membros já estão no chat</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chatHeaderInfo: {
    flex: 1,
  },
  chatHeaderName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  chatHeaderSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  membersButton: {
    padding: spacing.sm,
  },
  messageList: {
    flex: 1,
  },
  messageContent: {
    padding: spacing.md,
    flexGrow: 1,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: spacing.sm,
    borderRadius: 12,
    marginBottom: spacing.sm,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
  },
  messageText: {
    color: colors.text,
    fontSize: 16,
  },
  messageTime: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginLeft: spacing.sm,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
  pendingText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  typingIndicator: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  typingText: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  // Estilos do Modal de Membros
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  emptyMembersText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    padding: spacing.md,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    marginBottom: spacing.xs,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  memberInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  memberEmail: {
    fontSize: 12,
    color: colors.textMuted,
  },
  removeMemberButton: {
    padding: spacing.xs,
  },
  addMemberList: {
    maxHeight: 200,
  },
});

