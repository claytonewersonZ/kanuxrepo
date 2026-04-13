import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors } from '../theme';

interface KanuxLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export default function KanuxLogo({ size = 'md', showText = true }: KanuxLogoProps) {
  const dimensions = {
    sm: { icon: 40, title: 20, subtitle: 10 },
    md: { icon: 64, title: 28, subtitle: 14 },
    lg: { icon: 88, title: 36, subtitle: 16 },
  }[size];

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/icon.png')}
        style={{
          width: dimensions.icon,
          height: dimensions.icon,
          borderRadius: dimensions.icon * 0.22,
        }}
        resizeMode="contain"
      />
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
