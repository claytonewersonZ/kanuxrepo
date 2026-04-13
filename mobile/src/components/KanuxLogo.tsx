import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

interface KanuxLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export default function KanuxLogo({ size = 'md', showText = true }: KanuxLogoProps) {
  const dimensions = {
    sm: { icon: 40, font: 20, title: 20, subtitle: 10 },
    md: { icon: 64, font: 32, title: 28, subtitle: 14 },
    lg: { icon: 88, font: 44, title: 36, subtitle: 16 },
  }[size];

  return (
    <View style={styles.container}>
      <View style={[styles.iconContainer, { width: dimensions.icon, height: dimensions.icon, borderRadius: dimensions.icon / 2 }]}>
        <View style={[styles.innerRing, { width: dimensions.icon - 8, height: dimensions.icon - 8, borderRadius: (dimensions.icon - 8) / 2 }]}>
          <Text style={[styles.iconText, { fontSize: dimensions.font }]}>K</Text>
        </View>
      </View>
      {showText && (
        <View style={styles.textContainer}>
          <Text style={[styles.title, { fontSize: dimensions.title }]}>Kanux</Text>
          <Text style={[styles.subtitle, { fontSize: dimensions.subtitle }]}>Help Desk</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  iconContainer: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  innerRing: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  textContainer: {
    alignItems: 'center',
    marginTop: 12,
  },
  title: {
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 1,
  },
  subtitle: {
    color: colors.primaryLight,
    fontWeight: '500',
    letterSpacing: 2,
    marginTop: 2,
    textTransform: 'uppercase',
  },
});
