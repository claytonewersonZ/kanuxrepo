import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, Image, ActivityIndicator } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { Ticket, TicketComment, getTicketComments, addTicketComment, updateTicketStatus, getUserProfile, supabase } from '../../src/lib/supabase';
import { api } from '../../src/lib/api';
import { colors, spacing } from '../../src/theme';
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
  const router = useRouter();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  async function loadData() {
    if (!id) return;
    try {
      // Usar backend API (bypassa RLS) em vez de Supabase direto
      const ticketResult = await api.getTickets(undefined, id);
      const ticketData = ticketResult?.data;
      if (!ticketData) throw new Error('Ticket não encontrado');
      setTicket(ticketData);

      const commentsData = await getTicketComments(id);
      setComments(commentsData);
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
    if (comments.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [comments]);

  async function handleAddComment() {
    if (!newComment.trim() || !id || submitting) return;
    
    setSubmitting(true);
    try {
      const comment = await addTicketComment(id, newComment.trim());
      if (comment) {
        setComments(prev => [...prev, comment]);
        setNewComment('');
      }
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadTicketPhoto(uri: string, fileName: string, mimeType: string): Promise<string | null> {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filePath = `tickets/${id}/${Date.now()}_${fileName}`;
      const { error } = await supabase.storage
        .from('chat-media')
        .upload(filePath, blob, { contentType: mimeType, upsert: false });
      if (error) {
        console.error('Erro no upload da foto do ticket:', error);
        return null;
      }
      const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath);
      return data?.publicUrl ?? null;
    } catch (error) {
      console.error('Erro ao enviar foto do ticket:', error);
      return null;
    }
  }

  async function handlePickPhoto() {
    if (!id || submitting) return;

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

      const comment = await addTicketComment(id, `${TICKET_IMAGE_PREFIX}${url}`);
      if (comment) {
        setComments(prev => [...prev, comment]);
      }
    } catch (error) {
      console.error('Erro ao adicionar foto no ticket:', error);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!ticket || !id) return;
    
    try {
      const updated = await updateTicketStatus(
        id,
        newStatus as 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED'
      );
      if (updated) {
        setTicket(updated);
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }

  async function handlePriorityChange(newPriority: string) {
    if (!ticket || !id) return;
    
    try {
      const result = await api.updateTicket({
        id,
        priority: newPriority,
      });
      if (result?.data) {
        setTicket(result.data);
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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
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
                      <Image source={{ uri: imageUrl }} style={styles.commentImage} resizeMode="cover" />
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
            />
            <TouchableOpacity
              style={[styles.sendButton, (!newComment.trim() || submitting) && styles.sendButtonDisabled]}
              onPress={handleAddComment}
              disabled={!newComment.trim() || submitting}
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

