import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { colors } from '../src/theme';

export default function IndexScreen() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    // Já logado + perfil/empresa OK → tabs
    if (user && profile) {
      router.replace('/(tabs)');
      return;
    }

    // Logado mas sem perfil/empresa → selecionar empresa
    if (user && !profile) {
      router.replace('/company/select');
      return;
    }

    // Não logado → login
    if (!user) {
      router.replace('/(auth)/login');
      return;
    }
  }, [user, profile, loading, router]);

  return (
    <View style={styles.container}>
      {/* Logo Kanux */}
      <Image
        source={require('../assets/icon.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>Kanux</Text>
      <Text style={styles.subtitle}>HELP DESK</Text>
      
      {/* Indicador de carregamento */}
      <ActivityIndicator
        size="small"
        color={colors.primary}
        style={styles.loader}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#09090B',
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 26,
    marginBottom: 16,
  },
  title: {
    color: '#FAFAFA',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 1,
  },
  subtitle: {
    color: '#A78BFA',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 4,
    marginTop: 4,
  },
  loader: {
    marginTop: 40,
  },
});
