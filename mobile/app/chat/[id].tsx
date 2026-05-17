import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Modal, FlatList, Alert, Image, ActivityIndicator, StatusBar } from 'react-native';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { MediaPreviewModal } from '../../src/components/MediaPreviewModal';
import { TypingIndicator } from '../../src/components/TypingIndicator';
import { colors, spacing } from '../../src/theme';
import { useOfflineMessages } from '../../src/contexts/SyncContext';
import { useWebSocket } from '../../src/contexts/WebSocketContext';
import { useUnreadCounts } from '../../src/contexts/NotificationContext';
import { supabase, getChatMembersForChat, addMemberToChat, removeMemberFromChat, getCompanyMembers, ChatMember, Chat } from '../../src/lib/supabase';
import { api } from '../../src/lib/api';
import { ENV } from '../../src/lib/env';
import { getWorkingHoursRestrictionMessage } from '../../src/lib/workingHours';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Auxiliares de separador de data ─────────────────────────────────────────
function getDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

// Constrói lista de itens para o FlatList com separadores de data e pré-cálculo de showSender
function buildListItems(msgs: any[], myProfileId?: string): any[] {
  // Mensagens em ordem crescente (mais antigas primeiro)
  const items: any[] = [];
  for (let i = 0; i < msgs.length; i++) {
    // Inserir separador de data ao mudar de dia
    if (i === 0 || !isSameDay(msgs[i - 1].created_at, msgs[i].created_at)) {
      items.push({ type: 'date', id: `date_${i}`, label: getDateLabel(msgs[i].created_at) });
    }
    const prevMsg = i > 0 ? msgs[i - 1] : null;
    const isOwn = myProfileId ? msgs[i].user_profile_id === myProfileId : false;
    // Mostrar nome do remetente na primeira mensagem de cada grupo ou após troca de dia
    const novoGrupo = !prevMsg || prevMsg.user_profile_id !== msgs[i].user_profile_id
      || !isSameDay(prevMsg.created_at, msgs[i].created_at);
    items.push({ type: 'message', __showSender: !isOwn && novoGrupo, ...msgs[i] });
  }
  // Inverter para FlatList com inverted=true (mais recentes primeiro)
  return items.reverse();
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 8) : insets.bottom;
  const { subscribeChatMessages, subscribeChatTyping, subscribePresence, sendMessageWs, sendTypingWs, isConnected: wsConnected } = useWebSocket();
  const { markChatAsRead } = useUnreadCounts(id as string);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [remoteTyping, setRemoteTyping] = useState<string[]>([]);
  const [onlineMembers, setOnlineMembers] = useState<Set<string>>(new Set());
  const listRef = useRef<FlatList>(null);

  // Áudio
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const preparingRecordingRef = useRef(false);

  // Membros do chat
  const [chatMembers, setChatMembers] = useState<ChatMember[]>([]);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [companyMembers, setCompanyMembers] = useState<any[]>([]);
  const [chatInfo, setChatInfo] = useState<Chat | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<{ uri: string; type: 'image' | 'document'; name?: string | null } | null>(null);

  const { messages, loading, refresh } = useOfflineMessages(id as string);

  useFocusEffect(useCallback(() => {
    if (!id) return;
    markChatAsRead(id);
  }, [id, markChatAsRead]));

  // Ref estável para o refresh — evita stale closure no Supabase Realtime
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  // WebSocket STOMP: recebe mensagens em tempo real via backend Java
  useEffect(() => {
    if (!id) return;
    const unsub = subscribeChatMessages(id, () => {
      // Nova mensagem recebida via WebSocket — atualiza a lista
      refreshRef.current();
    });
    return unsub;
  }, [id, subscribeChatMessages]);

  // Carregar info do chat e membros
  useEffect(() => {
    if (!id) return;
    loadChatInfo();
    loadMembers();
  }, [id]);

  async function loadChatInfo() {
    try {
      const result = await api.getChats(undefined, id);
      if (result?.data) setChatInfo(result.data as Chat);
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

  // Verificar se o usuário pode enviar mensagens
  const canSendMessage = (() => {
    if (!chatInfo) return true; // permitir enquanto carrega
    if (!(chatInfo as any).only_admins_send) return true; // sem restrição
    if (profile?.is_super_admin) return true;
    // Verificar role no chat ou na company
    const myMembership = chatMembers.find(m => m.user_profile_id === profile?.id);
    if (myMembership?.role === 'ADMIN' || myMembership?.role === 'MANAGER') return true;
    return false;
  })();
  const workingHoursMessage = getWorkingHoursRestrictionMessage(profile, 'enviar mensagens');
  const blockedByWorkingHours = !!workingHoursMessage;
  const blockedInputMessage = blockedByWorkingHours
    ? workingHoursMessage
    : 'Apenas admins e managers podem enviar mensagens';

  // Status de digitação via WebSocket STOMP (fallback: polling Supabase se WS não conectado)
  useEffect(() => {
    if (!id) return;

    // Escuta typing via WebSocket
    const unsub = subscribeChatTyping(id, (payload) => {
      if (payload.user_profile_id === profile?.id) return; // ignora próprio typing
      setRemoteTyping(prev => {
        if (payload.typing) {
          return prev.includes(payload.display_name) ? prev : [...prev, payload.display_name];
        }
        return prev.filter(n => n !== payload.display_name);
      });
    });

    return unsub;
  }, [id, profile?.id, subscribeChatTyping]);

  // Limpar typing remoto quando sair da tela
  useEffect(() => {
    return () => { setRemoteTyping([]); };
  }, [id]);

  // Presença online via WebSocket
  useEffect(() => {
    if (!id) return;

    // Busca quem já está online no momento (snapshot inicial)
    api.getOnlineMembers(id).then((ids) => {
      setOnlineMembers(new Set(ids));
    }).catch(() => {});

    // Inscreve para receber mudanças futuras de presença
    const unsub = subscribePresence(id, (payload) => {
      setOnlineMembers(prev => {
        const next = new Set(prev);
        if (payload.online) {
          next.add(payload.user_profile_id);
        } else {
          next.delete(payload.user_profile_id);
        }
        return next;
      });
    });
    return unsub;
  }, [id, subscribePresence]);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const makeClientMessageId = useCallback(() => {
    return `${id}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  }, [id]);

  function handleTypingChange(text: string) {
    setNewMessage(text);
    if (blockedByWorkingHours) return;
    if (!id) return;

    // Envia typing=true via WebSocket STOMP
    sendTypingWs(id, true);

    // Cancela timeout anterior e agenda typing=false após 2s de inatividade
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingWs(id, false);
    }, 2000);
  }

  async function handleSend() {
    if (!newMessage.trim() || !id || sending) return;
    if (blockedByWorkingHours) {
      Alert.alert('Fora do horário', workingHoursMessage);
      return;
    }

    setSending(true);
    // Cancelar typing ao enviar
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTypingWs(id, false);

    try {
      const clientMessageId = makeClientMessageId();
      const content = newMessage.trim();
      const sentViaWs = wsConnected && sendMessageWs(id, newMessage.trim(), 'text', undefined, undefined, clientMessageId);
      if (sentViaWs) {
        setNewMessage('');
        return;
      }

      // Fallback REST para não bloquear envio durante restart/redeploy do backend.
      if (!profile?.id) {
        Alert.alert('Erro', 'Perfil indisponível para enviar mensagem.');
        return;
      }

      await api.sendMessage(id, content, profile.id, {
        messageType: 'text',
        clientMessageId,
      });
      setNewMessage('');
      refreshRef.current();
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      Alert.alert('Erro', 'Falha ao enviar mensagem. Tente novamente.');
    } finally {
      setSending(false);
    }
  }

  // ── Funções de Mídia ─────────────────────────────────────────────────────

  async function uploadToSupabase(uri: string, fileName: string, mimeType: string): Promise<string | null> {
    try {
      const filePath = `${id}/${Date.now()}_${fileName}`;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        console.error('Upload: sem sessão autenticada');
        return null;
      }

      // FormData com padrão nativo do React Native para file URIs
      const formData = new FormData();
      formData.append('file', { uri, name: fileName, type: mimeType } as any);

      const uploadRes = await fetch(`${ENV.SUPABASE_URL}/storage/v1/object/chat-media/${filePath}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': ENV.SUPABASE_ANON_KEY,
          'x-upsert': 'false',
        },
        body: formData as any,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        console.error('Upload error:', uploadRes.status, errText);
        return null;
      }

      return `${ENV.SUPABASE_URL}/storage/v1/object/public/chat-media/${filePath}`;
    } catch (e) {
      console.error('uploadToSupabase error:', e);
      return null;
    }
  }

  async function handlePickPhoto() {
    if (!id || sending) return;
    if (blockedByWorkingHours) {
      Alert.alert('Fora do horário', workingHoursMessage);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Habilite o acesso à galeria nas configurações.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setSending(true);
    try {
      const fileName = asset.fileName || `photo_${Date.now()}.jpg`;
      const mimeType = asset.mimeType || 'image/jpeg';
      const url = await uploadToSupabase(asset.uri, fileName, mimeType);
      if (!url) { Alert.alert('Erro', 'Falha ao enviar a foto.'); return; }
      const clientMessageId = makeClientMessageId();
      const sentViaWs = wsConnected && sendMessageWs(id, '', 'image', url, fileName, clientMessageId);
      if (!sentViaWs) {
        if (!profile?.id) {
          Alert.alert('Erro', 'Perfil indisponível para enviar foto.');
          return;
        }
        await api.sendMessage(id, '', profile.id, {
          messageType: 'image',
          mediaUrl: url,
          mediaName: fileName,
          clientMessageId,
        });
        refreshRef.current();
      }
    } finally { setSending(false); }
  }

  async function handlePickDocument() {
    if (!id || sending) return;
    if (blockedByWorkingHours) {
      Alert.alert('Fora do horário', workingHoursMessage);
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setSending(true);
    try {
      const mimeType = asset.mimeType || 'application/octet-stream';
      const url = await uploadToSupabase(asset.uri, asset.name, mimeType);
      if (!url) { Alert.alert('Erro', 'Falha ao enviar o arquivo.'); return; }
      const clientMessageId = makeClientMessageId();
      const sentViaWs = wsConnected && sendMessageWs(id, '', 'document', url, asset.name, clientMessageId);
      if (!sentViaWs) {
        if (!profile?.id) {
          Alert.alert('Erro', 'Perfil indisponível para enviar arquivo.');
          return;
        }
        await api.sendMessage(id, '', profile.id, {
          messageType: 'document',
          mediaUrl: url,
          mediaName: asset.name,
          clientMessageId,
        });
        refreshRef.current();
      }
    } finally { setSending(false); }
  }

  async function handleStartRecording() {
    if (isRecording || recording || preparingRecordingRef.current || sending) return;
    if (blockedByWorkingHours) {
      Alert.alert('Fora do horário', workingHoursMessage);
      return;
    }

    preparingRecordingRef.current = true;
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { Alert.alert('Permissão necessária', 'Habilite o acesso ao microfone.'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
    } catch (e) {
      console.error('Erro ao iniciar gravação:', e);
      setRecording(null);
      setIsRecording(false);
    } finally {
      preparingRecordingRef.current = false;
    }
  }

  async function handleStopRecording() {
    if (!recording || !id) return;
    setIsRecording(false);
    setSending(true);
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) return;
      const fileName = `audio_${Date.now()}.m4a`;
      const url = await uploadToSupabase(uri, fileName, 'audio/m4a');
      if (!url) { Alert.alert('Erro', 'Falha ao enviar o áudio.'); return; }
      const clientMessageId = makeClientMessageId();
      const sentViaWs = wsConnected && sendMessageWs(id, '', 'audio', url, fileName, clientMessageId);
      if (!sentViaWs) {
        if (!profile?.id) {
          Alert.alert('Erro', 'Perfil indisponível para enviar áudio.');
          return;
        }
        await api.sendMessage(id, '', profile.id, {
          messageType: 'audio',
          mediaUrl: url,
          mediaName: fileName,
          clientMessageId,
        });
        refreshRef.current();
      }
    } finally { setSending(false); }
  }

  // Garantir ordenação ASC antes de buildListItems (defesa contra dados desordenados)
  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages]
  );

  // Itens da lista memoizados para evitar recálculo a cada render
  const listItems = useMemo(() => buildListItems(sortedMessages, profile?.id), [sortedMessages, profile?.id]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : (StatusBar.currentHeight ?? 0)}
    >
        {/* Barra de informações do chat */}
      <View style={styles.chatHeader}>
        <View style={styles.chatHeaderInfo}>
          <Text style={styles.chatHeaderName}>{chatInfo?.name || 'Chat'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[styles.onlineDot, onlineMembers.size > 0 ? styles.onlineDotActive : styles.onlineDotInactive]} />
            <Text style={styles.chatHeaderSub}>
              {chatInfo?.is_private ? '🔒 Privado' : '# Público'} • {chatMembers.length} membros
              {onlineMembers.size > 0 ? ` • ${onlineMembers.size} online` : ''}
            </Text>
          </View>
          {remoteTyping.length > 0 && (
            <Text style={styles.typingHeaderText}>
              {remoteTyping.length === 1
                ? `${remoteTyping[0]} está digitando...`
                : `${remoteTyping[0]} e mais ${remoteTyping.length - 1} estão digitando...`}
            </Text>
          )}
        </View>
        <TouchableOpacity style={styles.membersButton} onPress={openMembersModal}>
          <Ionicons name="people" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        style={styles.messageList}
        contentContainerStyle={[styles.messageContent, { paddingBottom: spacing.md + bottomInset }]}
        data={listItems}
        keyExtractor={(item: any) => item.id || item.label}
        inverted
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }: { item: any; index: number }) => {
          if (item.type === 'date') {
            return (
              <View style={styles.dateSeparator}>
                <View style={styles.dateSeparatorLine} />
                <Text style={styles.dateSeparatorText}>{item.label}</Text>
                <View style={styles.dateSeparatorLine} />
              </View>
            );
          }
          const isMyMessage = item.user_profile_id === profile?.id;
          const senderName = item.display_name || item.user_display_name ||
            chatMembers.find((m: any) => m.user_profile_id === item.user_profile_id)?.user_profile?.display_name || 'Usuário';
          const senderAvatar = item.avatar_url ||
            chatMembers.find((m: any) => m.user_profile_id === item.user_profile_id)?.user_profile?.avatar_url;
          // showSender pré-calculado em buildListItems (primeiro de cada grupo de mensagens)
          const showSender = item.__showSender;
          return (
            <View style={[styles.messageRow, isMyMessage ? styles.myMessageRow : styles.otherMessageRow]}>
              {!isMyMessage && (
                senderAvatar ? (
                  <Image source={{ uri: senderAvatar }} style={styles.msgAvatar} />
                ) : (
                  <View style={styles.msgAvatarPlaceholder}>
                    <Text style={styles.msgAvatarText}>{(senderName || 'U').charAt(0).toUpperCase()}</Text>
                  </View>
                )
              )}
              <View style={[styles.messageBubble, isMyMessage ? styles.myMessage : styles.otherMessage]}>
                {showSender && (
                  <Text style={styles.senderName}>{senderName}</Text>
                )}
                {/* Renderização por tipo de mídia */}
                {item.message_type === 'image' && item.media_url ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setPreviewMedia({ uri: item.media_url, type: 'image', name: item.media_name })}
                  >
                    <Image
                      source={{ uri: item.media_url }}
                      style={styles.mediaImage}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ) : item.message_type === 'audio' && item.media_url ? (
                  <AudioPlayer url={item.media_url} isMyMessage={isMyMessage} />
                ) : item.message_type === 'document' && item.media_url ? (
                  <TouchableOpacity
                    style={styles.documentRow}
                    onPress={() => setPreviewMedia({ uri: item.media_url, type: 'document', name: item.media_name })}
                  >
                    <Ionicons name="document-attach" size={22} color={isMyMessage ? '#fff' : colors.primary} />
                    <Text style={[styles.documentName, isMyMessage && styles.myMessageText]} numberOfLines={1}>
                      {item.media_name || 'Documento'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.messageText, isMyMessage && styles.myMessageText]}>{item.content}</Text>
                )}
                <Text style={[styles.messageTime, isMyMessage && styles.myMessageTime]}>
                  {new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
                {item.pending && (
                  <Text style={styles.pendingText}>Enviando...</Text>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Nenhuma mensagem ainda</Text>
              <Text style={styles.emptySubtext}>Envie uma mensagem para começar a conversa</Text>
            </View>
          ) : null
        }
        ListHeaderComponent={
          remoteTyping.length > 0 ? (
            <TypingIndicator names={remoteTyping} />
          ) : null
        }
      />

      <View style={[styles.inputContainer, { paddingBottom: spacing.sm + bottomInset }]}>
        {canSendMessage && !blockedByWorkingHours ? (
          <>
            {/* Botões de mídia */}
            <TouchableOpacity style={styles.mediaButton} onPress={handlePickPhoto} disabled={sending}>
              <Ionicons name="image-outline" size={22} color={sending ? colors.textMuted : colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaButton} onPress={handlePickDocument} disabled={sending}>
              <Ionicons name="attach-outline" size={22} color={sending ? colors.textMuted : colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mediaButton, isRecording && styles.mediaButtonRecording]}
              onPressIn={handleStartRecording}
              onPressOut={handleStopRecording}
              disabled={sending && !isRecording}
            >
              <Ionicons name={isRecording ? 'stop-circle' : 'mic-outline'} size={22} color={isRecording ? colors.error : (sending ? colors.textMuted : colors.primary)} />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Digite sua mensagem..."
              placeholderTextColor={colors.textMuted}
              value={newMessage}
              onChangeText={handleTypingChange}
              multiline
              maxLength={1000}
            />
            {sending ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: spacing.sm }} />
            ) : (
              <TouchableOpacity
                style={[styles.sendButton, !newMessage.trim() && styles.sendButtonDisabled]}
                onPress={handleSend}
                disabled={!newMessage.trim()}
              >
                <Ionicons name="send" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </>
        ) : (
          <View style={styles.blockedInput}>
            <Ionicons name="lock-closed" size={16} color={colors.textMuted} />
            <Text style={styles.blockedText}>{blockedInputMessage}</Text>
          </View>
        )}
      </View>

      <MediaPreviewModal
        visible={!!previewMedia}
        uri={previewMedia?.uri ?? null}
        type={previewMedia?.type ?? 'image'}
        name={previewMedia?.name}
        onClose={() => setPreviewMedia(null)}
      />

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
                {member.user_profile?.avatar_url ? (
                  <Image source={{ uri: member.user_profile.avatar_url }} style={styles.memberAvatarImg} />
                ) : (
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>
                      {(member.user_profile?.display_name || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
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
                .filter(m => !isMemberInChat(m.user_profile_id))
                .map(member => (
                  <TouchableOpacity
                    key={member.id}
                    style={styles.memberItem}
                    onPress={() => handleAddMember(member.user_profile_id)}
                  >
                    <View style={[styles.memberAvatar, { backgroundColor: colors.success }]}>
                      <Text style={styles.memberAvatarText}>
                        {(member.user_profiles?.display_name || 'U').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{member.user_profiles?.display_name || 'Sem nome'}</Text>
                      <Text style={styles.memberEmail}>{member.user_profiles?.email || ''}</Text>
                    </View>
                    <Ionicons name="add-circle" size={22} color={colors.success} />
                  </TouchableOpacity>
                ))}
              {companyMembers.filter(m => !isMemberInChat(m.user_profile_id)).length === 0 && (
                <Text style={styles.emptyMembersText}>Todos os membros já estão no chat</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── Componente AudioPlayer inline ────────────────────────────────────────
function AudioPlayer({ url, isMyMessage }: { url: string; isMyMessage: boolean }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

  async function togglePlay() {
    if (!playing) {
      if (sound) {
        await sound.replayAsync();
      } else {
        const { sound: s } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true }
        );
        s.setOnPlaybackStatusUpdate((status: any) => {
          if (status.didJustFinish) { setPlaying(false); }
        });
        setSound(s);
      }
      setPlaying(true);
    } else {
      if (sound) await sound.pauseAsync();
      setPlaying(false);
    }
  }

  useEffect(() => {
    return () => { sound?.unloadAsync(); };
  }, [sound]);

  return (
    <TouchableOpacity style={audioStyles.row} onPress={togglePlay}>
      <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={32} color={isMyMessage ? '#fff' : colors.primary} />
      <Text style={[audioStyles.label, isMyMessage && { color: '#fff' }]}>
        {playing ? 'Pausar' : 'Áudio'}
      </Text>
    </TouchableOpacity>
  );
}

const audioStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  label: { color: colors.textSecondary, fontSize: 14 },
});

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
  typingHeaderText: {
    fontSize: 11,
    color: colors.primary,
    fontStyle: 'italic',
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
    fontSize: 15,
  },
  senderName: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
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
  blockedInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.sm,
  },
  blockedText: {
    color: colors.textMuted,
    fontSize: 14,
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
  // New styles for avatars, message rows, online dots
  messageRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    alignItems: 'flex-end',
  },
  myMessageRow: {
    justifyContent: 'flex-end',
  },
  otherMessageRow: {
    justifyContent: 'flex-start',
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 6,
  },
  msgAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary + '40',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  msgAvatarText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  msgAvatarSpacer: {
    width: 34,
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.divider ?? colors.border,
  },
  dateSeparatorText: {
    fontSize: 12,
    color: colors.textMuted,
    marginHorizontal: spacing.sm,
    backgroundColor: colors.background,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  myMessageText: {
    color: '#fff',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  onlineDotActive: {
    backgroundColor: '#22C55E',
  },
  onlineDotInactive: {
    backgroundColor: colors.textMuted,
  },
  memberAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  // ── Estilos de mídia ──
  mediaImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 4,
  },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    maxWidth: 200,
  },
  documentName: {
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  myMessageTime: {
    color: 'rgba(255,255,255,0.7)',
  },
  // ── Botões de mídia na área de input ──
  mediaButton: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaButtonRecording: {
    backgroundColor: colors.error + '22',
    borderRadius: 20,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
