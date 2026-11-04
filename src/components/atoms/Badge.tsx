import React from 'react';
import { StyleSheet, View } from 'react-native';
import { radius, spacing, Tone, toneColors } from '../../theme';
import { AppText } from './AppText';

export const Badge = ({ label, tone = 'neutral' }: { label: string; tone?: Tone }) => (
  <View style={[styles.b, { backgroundColor: toneColors[tone].bg }]}>
    <AppText variant="caption" color={toneColors[tone].fg} style={styles.t}>{label}</AppText>
  </View>
);
const styles = StyleSheet.create({
  b: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm + 2, paddingVertical: 3, borderRadius: radius.pill },
  t: { fontWeight: '600' },
});
