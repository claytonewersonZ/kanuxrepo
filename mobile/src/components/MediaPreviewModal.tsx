import { Alert, Image, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../theme';

interface MediaPreviewModalProps {
  visible: boolean;
  uri: string | null;
  type: 'image' | 'document';
  name?: string | null;
  onClose: () => void;
}

export function MediaPreviewModal({ visible, uri, type, name, onClose }: MediaPreviewModalProps) {
  async function handleOpenExternal() {
    if (!uri) return;
    try {
      const supported = await Linking.canOpenURL(uri);
      if (!supported) {
        Alert.alert('Arquivo indisponível', 'Não foi possível abrir este arquivo neste dispositivo.');
        return;
      }
      await Linking.openURL(uri);
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir o arquivo.');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {name || (type === 'image' ? 'Imagem' : 'Documento')}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {type === 'image' && uri ? (
            <View style={styles.imageContainer}>
              <Image source={{ uri }} style={styles.image} resizeMode="contain" />
            </View>
          ) : (
            <View style={styles.documentContainer}>
              <Ionicons name="document-text" size={52} color={colors.primary} />
              <Text style={styles.documentName} numberOfLines={2}>
                {name || 'Documento'}
              </Text>
              <Text style={styles.documentHint}>
                O PDF ou arquivo será aberto no visualizador disponível do dispositivo.
              </Text>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryText}>Fechar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={handleOpenExternal}>
              <Ionicons name={type === 'image' ? 'expand-outline' : 'open-outline'} size={18} color="#fff" />
              <Text style={styles.primaryText}>{type === 'image' ? 'Abrir grande' : 'Abrir arquivo'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginRight: spacing.sm,
  },
  closeButton: {
    padding: 4,
  },
  imageContainer: {
    height: 420,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  documentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  documentName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  documentHint: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  secondaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
  },
  primaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});