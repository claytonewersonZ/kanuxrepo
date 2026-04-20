import { Stack, useRouter, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { SyncProvider } from '../src/contexts/SyncContext';
import { useNotifications } from '../src/contexts/NotificationContext';
import { colors } from '../src/theme';
import { ActivityIndicator, View, Text, Image } from 'react-native';

function AuthGate() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  
  useEffect(() => {
    if (loading) return;
    
    // Já logado + perfil/empresa OK → tabs (apenas se estiver em tela de auth)
    if (user && profile) {
      if (pathname.includes('login') || pathname.includes('company/select')) {
        router.replace('/(tabs)');
      }
      return;
    }
    
    // Logado mas sem perfil/empresa → selecionar empresa
    if (user && !profile) {
      if (!pathname.includes('company/select')) router.replace('/company/select');
      return;
    }
    
    // Não logado → login
    if (!user) {
      if (!pathname.includes('login')) router.replace('/(auth)/login');
    }
  }, [user, profile, loading, pathname]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Image
          source={require('../assets/icon.png')}
          style={{ width: 80, height: 80, borderRadius: 18, marginBottom: 16 }}
          resizeMode="contain"
        />
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: 1 }}>Kanux</Text>
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 24 }} />
      </View>
    );
  }

  return null;
}

/** Componente que ativa o hook de notificações dentro dos providers de auth */
function NotificationSetup() {
  useNotifications();
  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <SyncProvider>
        <NotificationSetup />
        <StatusBar style="dark" />
        <AuthGate />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '600' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/login" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]" options={{ title: 'Chat', headerBackTitle: 'Voltar' }} />
          <Stack.Screen name="ticket/[id]" options={{ title: 'Ticket', headerBackTitle: 'Voltar' }} />
          <Stack.Screen 
            name="company/select" 
            options={{ 
              title: 'Selecionar Empresa', 
              headerBackTitle: 'Voltar', 
              presentation: 'modal' 
            }} 
          />
          <Stack.Screen name="admin" options={{ title: 'Admin' }} />
          <Stack.Screen name="tickets/create" options={{ title: 'Novo Ticket' }} />
        </Stack>
      </SyncProvider>
    </AuthProvider>
  );
}
