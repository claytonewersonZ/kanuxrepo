import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, Image, ActivityIndicator, StatusBar } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MediaPreviewModal } from '../../src/components/MediaPreviewModal';
import { useAuth } from '../../src/contexts/AuthContext';
import { useWebSocket } from '../../src/contexts/WebSocketContext';
import { Ticket, TicketComment, getTicketComments, supabase } from '../../src/lib/supabase';
import { api } from '../../src/lib/api';
import { ENV } from '../../src/lib/env';
import { colors, spacing } from '../../src/theme';
import { getWorkingHoursRestrictionMessage } from '../../src/lib/workingHours';
import * as ImagePicker from 'expo-image-picker';

const TICKET_IMAGE_PREFIX = '[image]:';

function getImageUrlFromComment(content?: string): string | null {
  if (!content) return null;
  if (!content.startsWith(TICKET_IMAGE_PREFIX)) return null;
  const url = content.replace(TICKET_IMAGE_PREFIX, '').trim();
  return url || null;
}

export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const { subscribeTicketComments, subscribeTicketUpdates, sendTicketCommentWs, updateTicketWs } = useWebSocket();
  const router = useRouter();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const workingHoursMessage = getWorkingHoursRestrictionMessage(profile, 'responder chamados');
  const blockedByWorkingHours = !!workingHoursMessage;

  function appendComment(comment: any) {
    setComments(prev => {
      if (prev.some(item => item.id === comment.id)) {
        return prev;
      }
      return [...prev, comment].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  }

  async function loadComments() {
    if (!id) return;
    try {
      const commentsData = await getTicketComments(id);
      setComments(commentsData);
    } catch (error) {
      console.error('Error loading comments:', error);
    }
  }

  async function loadData() {
    if (!id) return;
    try {
      // Usar backend API (bypassa RLS) em vez de Supabase direto
      const ticketResult = await api.getTickets(undefined, id);
      const ticketData = ticketResult?.data;
      if (!ticketData) throw new Error('Ticket não encontrado');
      setTicket(ticketData);

      await loadComments();
    } catch (error) {
      console.error('Error loading ticket:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    return subscribeTicketComments(id, (comment) => {
      appendComment(comment);
    });
  }, [id, subscribeTicketComments]);

  useEffect(() => {
    if (!id) return;
    return subscribeTicketUpdates(id, (updatedTicket) => {
      setTicket(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          status: updatedTicket.status,
          priority: updatedTicket.priority,
          title: updatedTicket.title,
          description: updatedTicket.description ?? null,
          updated_at: updatedTicket.updatedAt,
          resolved_at: updatedTicket.resolvedAt ?? null,
        } as Ticket;
      });
    });
  }, [id, subscribeTicketUpdates]);

  useEffect(() => {
    if (comments.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [comments]);

  async function handleAddComment() {
    if (!newComment.trim() || !id || submitting) return;
    if (blockedByWorkingHours) {
      Alert.alert('Fora do horário', workingHoursMessage);
      return;
    }
    
    setSubmitting(true);
    try {
      const sent = sendTicketCommentWs(id, newComment.trim());
      if (!sent) {
        Alert.alert('WebSocket desconectado', 'Conecte-se novamente para enviar comentários em tempo real.');
        return;
      }
      setNewComment('');
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadTicketPhoto(uri: string, fileName: string, mimeType: string): Promise<string | null> {
    try {
      const filePath = `tickets/${id}/${Date.now()}_${fileName}`;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        console.error('Upload: sem sessão autenticada');
        return null;
      }

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
        console.error('Erro no upload da foto do ticket:', errText);
        return null;
      }

      return `${ENV.SUPABASE_URL}/storage/v1/object/public/chat-media/${filePath}`;
    } catch (error) {
      console.error('Erro ao enviar foto do ticket:', error);
      return null;
    }
  }

  async function handlePickPhoto() {
    if (!id || submitting) return;
    if (blockedByWorkingHours) {
      Alert.alert('Fora do horário', workingHoursMessage);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Habilite o acesso à galeria para enviar fotos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: false,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setSubmitting(true);
    try {
      const fileName = asset.fileName || `ticket_photo_${Date.now()}.jpg`;
      const mimeType = asset.mimeType || 'image/jpeg';
      const url = await uploadTicketPhoto(asset.uri, fileName, mimeType);
      if (!url) {
        Alert.alert('Erro', 'Falha ao enviar foto.');
        return;
      }

      const sent = sendTicketCommentWs(id, `${TICKET_IMAGE_PREFIX}${url}`);
      if (!sent) {
        Alert.alert('WebSocket desconectado', 'Conecte-se novamente para enviar comentários em tempo real.');
      }
    } catch (error) {
      console.error('Erro ao adicionar foto no ticket:', error);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!ticket || !id) return;
    if (blockedByWorkingHours) {
      Alert.alert('Fora do horário', workingHoursMessage);
      return;
    }
    
    try {
      const sent = updateTicketWs(id, { status: newStatus });
      if (!sent) {
        Alert.alert('WebSocket desconectado', 'Conecte-se novamente para atualizar o ticket em tempo real.');
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }

  async function handlePriorityChange(newPriority: string) {
    if (!ticket || !id) return;
    if (blockedByWorkingHours) {
      Alert.alert('Fora do horário', workingHoursMessage);
      return;
    }
    
    try {
      const sent = updateTicketWs(id, { priority: newPriority });
      if (!sent) {
        Alert.alert('WebSocket desconectado', 'Conecte-se novamente para atualizar o ticket em tempo real.');
      }
    } catch (error) {
      console.error('Erro ao atualizar prioridade:', error);
    }
  }

  const statusOptions = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];
  const priorityOptions = ['LOW', 'MEDIUM', 'HIGH'];

  function getAuthorName(comment: any): string {
    if (comment.user_profile?.display_name) return comment.user_profile.display_name;
    if (comment.author_name) return comment.author_name;
    return 'Usuário';
  }

  function getAuthorInitial(comment: any): string {
    return getAuthorName(comment).charAt(0).toUpperCase();
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : (StatusBar.currentHeight ?? 0)}
    >
      {ticket && (
        <>
          {/* Header do Ticket */}
          <TouchableOpacity style={styles.ticketHeader} onPress={() => setShowInfo(!showInfo)} activeOpacity={0.7}>
            <View style={styles.ticketHeaderLeft}>
              <Text style={styles.ticketNumber}>{ticket.number}</Text>
              <Text style={styles.title} numberOfLines={1}>{ticket.title}</Text>
            </View>
            <View style={styles.ticketHeaderRight}>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(ticket.status) }]}>
                <Text style={styles.badgeText}>{getStatusLabel(ticket.status)}</Text>
              </View>
              <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(ticket.priority) }]}>
                <Text style={styles.badgeText}>{getPriorityLabel(ticket.priority)}</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Painel de Info expandível */}
          {showInfo && (
            <View style={styles.infoPanel}>
              {blockedByWorkingHours && (
                <View style={styles.infoSection}>
                  <Text style={styles.infoLabel}>Bloqueio de horário</Text>
                  <Text style={styles.infoValue}>{workingHoursMessage}</Text>
                </View>
              )}
              {/* Descrição */}
              {ticket.description ? (
                <View style={styles.infoSection}>
                  <Text style={styles.infoLabel}>Descrição</Text>
                  <Text style={styles.infoValue}>{ticket.description}</Text>
                </View>
              ) : null}

              {/* Status */}
              <View style={styles.infoSection}>
                <Text style={styles.infoLabel}>Alterar Status</Text>
                <View style={styles.actionRow}>
                  {statusOptions.map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.actionChip,
                        ticket.status === status && styles.actionChipActive,
                        { backgroundColor: getStatusColor(status) }
                      ]}
                      onPress={() => handleStatusChange(status)}
                      disabled={blockedByWorkingHours}
                    >
                      <Text style={styles.actionChipText}>{getStatusLabel(status)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Prioridade */}
              <View style={styles.infoSection}>
                <Text style={styles.infoLabel}>Alterar Prioridade</Text>
                <View style={styles.actionRow}>
                  {priorityOptions.map((priority) => (
                    <TouchableOpacity
                      key={priority}
                      style={[
                        styles.actionChip,
                        ticket.priority === priority && styles.actionChipActive,
                        { backgroundColor: getPriorityColor(priority) }
                      ]}
                      onPress={() => handlePriorityChange(priority)}
                      disabled={blockedByWorkingHours}
                    >
                      <Text style={styles.actionChipText}>{getPriorityLabel(priority)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* Chat de Mensagens */}
          <ScrollView
            ref={scrollRef}
            style={styles.messageList}
            contentContainerStyle={styles.messageContent}
          >
            {comments.length === 0 && !loading && (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Nenhuma mensagem ainda</Text>
                <Text style={styles.emptySubtext}>Envie uma mensagem para iniciar a conversa</Text>
              </View>
            )}
            {comments.map((comment) => {
              const isMyMessage = comment.user_profile_id === profile?.id;
              const imageUrl = getImageUrlFromComment(comment.content);
              return (
                <View key={comment.id} style={[styles.messageRow, isMyMessage && styles.messageRowMine]}>
                  {!isMyMessage && (
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{getAuthorInitial(comment)}</Text>
                    </View>
                  )}
                  <View style={[styles.messageBubble, isMyMessage ? styles.myMessage : styles.otherMessage]}>
                    {!isMyMessage && (
                      <Text style={styles.authorName}>{getAuthorName(comment)}</Text>
                    )}
                    {imageUrl ? (
                      <TouchableOpacity activeOpacity={0.9} onPress={() => setPreviewImageUrl(imageUrl)}>
                        <Image source={{ uri: imageUrl }} style={styles.commentImage} resizeMode="cover" />
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.messageText}>{comment.content}</Text>
                    )}
                    <Text style={styles.messageTime}>
                      {new Date(comment.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Input de Mensagem */}
          <View style={styles.inputContainer}>
            <TouchableOpacity style={styles.mediaButton} onPress={handlePickPhoto} disabled={submitting}>
              <Text style={styles.mediaButtonText}>📷</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Digite sua mensagem..."
              placeholderTextColor={colors.textMuted}
              value={newComment}
              onChangeText={setNewComment}
              multiline
              maxLength={1000}
              editable={!blockedByWorkingHours}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!newComment.trim() || submitting) && styles.sendButtonDisabled]}
              onPress={handleAddComment}
              disabled={!newComment.trim() || submitting || blockedByWorkingHours}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Text style={styles.sendButtonText}>Enviar</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}

      <MediaPreviewModal
        visible={!!previewImageUrl}
        uri={previewImageUrl}
        type="image"
        name="Foto do ticket"
        onClose={() => setPreviewImageUrl(null)}
      />
    </KeyboardAvoidingView>
  );
}

function getStatusColor(status: string) {
  switch (status) {
    case 'OPEN': return colors.statusOpen;
    case 'PENDING': return colors.statusPending;
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
  switch (priority) {
    case 'HIGH': return colors.priorityHigh;
    case 'MEDIUM': return colors.priorityMedium;
    case 'LOW': return colors.priorityLow;
    default: return colors.textMuted;
  }
}

function getPriorityLabel(priority: string) {
  switch (priority) {
    case 'HIGH': return 'Alta';
    case 'MEDIUM': return 'Média';
    case 'LOW': return 'Baixa';
    default: return priority;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Header do ticket
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ticketHeaderLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  ticketNumber: {
    fontSize: 12,
    color: colors.textMuted,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 2,
  },
  ticketHeaderRight: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 4,
  },
  priorityBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    color: colors.text,
    fontWeight: '600',
  },
  // Painel de info
  infoPanel: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    padding: spacing.md,
  },
  infoSection: {
    marginBottom: spacing.md,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  actionChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionChipActive: {
    borderWidth: 2,
    borderColor: colors.text,
  },
  actionChipText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 11,
  },
  // Chat de mensagens
  messageList: {
    flex: 1,
  },
  messageContent: {
    padding: spacing.md,
    flexGrow: 1,
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
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.sm,
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  avatarText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: 'bold',
  },
  messageBubble: {
    maxWidth: '75%',
    padding: spacing.sm,
    borderRadius: 12,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
  },
  authorName: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  messageText: {
    color: colors.text,
    fontSize: 15,
  },
  commentImage: {
    width: 220,
    height: 220,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  messageTime: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  // Input
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
    fontSize: 15,
    maxHeight: 100,
  },
  mediaButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  mediaButtonText: {
    fontSize: 18,
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
});

