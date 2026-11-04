import React from 'react';
import { StyleSheet, View } from 'react-native';
import { radius, spacing, Tone, toneColors } from '../../theme';
import { AppText } from '../atoms/AppText';

export const Banner = ({ tone, title, detail }: { tone: Tone; title: string; detail?: string }) => (
  <View accessibilityRole="alert" style={[styles.b, { backgroundColor: toneColors[tone].bg }]}>
    <AppText variant="label" color={toneColors[tone].fg}>{title}</AppText>
    {detail ? <AppText variant="caption" color={toneColors[tone].fg}>{detail}</AppText> : null}
  </View>
);
const styles = StyleSheet.create({ b: { padding: spacing.md, borderRadius: radius.md, gap: 2 } });
