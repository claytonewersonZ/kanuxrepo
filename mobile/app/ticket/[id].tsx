import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { supabase, Ticket, TicketComment, getTicketComments, addTicketComment, updateTicketStatus, getUserProfile } from '../../src/lib/supabase';
import { api } from '../../src/lib/api';
import { colors, spacing } from '../../src/theme';

export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<(TicketComment & { author_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    if (!id) return;
    try {
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', id)
        .single();

      if (ticketError) throw ticketError;
      setTicket(ticketData);

      const commentsData = await getTicketComments(id);
      
      // Get author names for comments
      const commentsWithAuthors = await Promise.all(
        commentsData.map(async (comment) => {
          const profile = await getUserProfile(comment.user_profile_id);
          return {
            ...comment,
            author_name: profile?.display_name || profile?.email || 'Unknown',
          };
        })
      );
      
      setComments(commentsWithAuthors);
    } catch (error) {
      console.error('Error loading ticket:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [id]);

  async function handleAddComment() {
    if (!newComment.trim() || !id || submitting) return;
    
    setSubmitting(true);
    try {
      const comment = await addTicketComment(id, newComment.trim());
      if (comment) {
        const profile = await getUserProfile(user?.id || '');
        const commentWithAuthor = {
          ...comment,
          author_name: profile?.display_name || profile?.email || 'Você',
        };
        setComments(prev => [...prev, commentWithAuthor]);
        setNewComment('');
      }
    } catch (error) {
      console.error('Error adding comment:', error);
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {ticket && (
        <>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.ticketNumber}>{ticket.number}</Text>
            <Text style={styles.title}>{ticket.title}</Text>
            <View style={styles.metaRow}>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(ticket.status) }]}>
                <Text style={styles.statusText}>{ticket.status}</Text>
              </View>
              <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(ticket.priority) }]}>
                <Text style={styles.priorityText}>{ticket.priority}</Text>
              </View>
            </View>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Descrição</Text>
            <View style={styles.descriptionCard}>
              <Text style={styles.description}>
                {ticket.description || 'Sem descrição'}
              </Text>
            </View>
          </View>

          {/* Status Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Alterar Status</Text>
            <View style={styles.statusButtons}>
              {statusOptions.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.statusButton,
                    ticket.status === status && styles.statusButtonActive,
                    { backgroundColor: getStatusColor(status) }
                  ]}
                  onPress={() => handleStatusChange(status)}
                >
                  <Text style={styles.statusButtonText}>{getStatusLabel(status)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Priority Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Alterar Prioridade</Text>
            <View style={styles.statusButtons}>
              {priorityOptions.map((priority) => (
                <TouchableOpacity
                  key={priority}
                  style={[
                    styles.statusButton,
                    ticket.priority === priority && styles.statusButtonActive,
                    { backgroundColor: getPriorityColor(priority) }
                  ]}
                  onPress={() => handlePriorityChange(priority)}
                >
                  <Text style={styles.statusButtonText}>{getPriorityLabel(priority)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Comments */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Comentários ({comments.length})</Text>
            
            {comments.map((comment) => (
              <View key={comment.id} style={styles.commentCard}>
                <View style={styles.commentHeader}>
                  <Text style={styles.commentAuthor}>{comment.author_name}</Text>
                  <Text style={styles.commentDate}>
                    {new Date(comment.created_at).toLocaleDateString('pt-BR')}
                  </Text>
                </View>
                <Text style={styles.commentContent}>{comment.content}</Text>
              </View>
            ))}

            {/* Add Comment */}
            <View style={styles.addComment}>
              <TextInput
                style={styles.commentInput}
                placeholder="Adicionar comentário..."
                placeholderTextColor={colors.textMuted}
                value={newComment}
                onChangeText={setNewComment}
                multiline
                numberOfLines={3}
              />
              <TouchableOpacity
                style={[styles.submitButton, (!newComment.trim() || submitting) && styles.submitButtonDisabled]}
                onPress={handleAddComment}
                disabled={!newComment.trim() || submitting}
              >
                <Text style={styles.submitButtonText}>Enviar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </ScrollView>
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
  content: {
    padding: spacing.md,
  },
  header: {
    marginBottom: spacing.lg,
  },
  ticketNumber: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
  },
  priorityBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  descriptionCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
  },
  description: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  statusButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statusButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
  },
  statusButtonActive: {
    borderWidth: 2,
    borderColor: colors.text,
  },
  statusButtonText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 12,
  },
  commentCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  commentDate: {
    fontSize: 12,
    color: colors.textMuted,
  },
  commentContent: {
    color: colors.text,
    fontSize: 14,
  },
  addComment: {
    marginTop: spacing.md,
  },
  commentInput: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    color: colors.text,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
});

