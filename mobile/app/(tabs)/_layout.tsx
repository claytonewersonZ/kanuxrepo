import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { colors } from '../../src/theme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnreadCounts } from '../../src/contexts/NotificationContext';

function TabIcon({ name, color, focused }: { name: keyof typeof Ionicons.glyphMap; color: string; focused: boolean }) {
  return (
    <View style={[styles.tabIconContainer, focused && styles.tabIconActive]}>
      <Ionicons name={name} size={24} color={color} />
      {focused && <View style={styles.activeIndicator} />}
    </View>
  );
}

export default function TabLayout() {
  const { totalUnread } = useUnreadCounts();
  const insets = useSafeAreaInsets();
  const tabBottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 8) : insets.bottom;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.divider,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 60 + tabBottomInset : 54 + tabBottomInset,
          paddingBottom: tabBottomInset,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 0,
        },
        headerStyle: {
          backgroundColor: colors.surface,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: colors.divider,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 17,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'home' : 'home-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarBadge: totalUnread > 0 ? (totalUnread > 99 ? '99+' : totalUnread) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#8B5CF6', fontSize: 10 },
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'chatbubbles' : 'chatbubbles-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: 'Tickets',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'ticket' : 'ticket-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'person' : 'person-outline'} color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 32,
    borderRadius: 8,
  },
  tabIconActive: {
    backgroundColor: colors.primary + '18',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -4,
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
});
