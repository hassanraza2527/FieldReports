import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../../theme';
import { AppText } from '../atoms/AppText';

export const EmptyState = ({ title, detail }: { title: string; detail?: string }) => (
  <View style={styles.w}>
    <AppText variant="heading">{title}</AppText>
    {detail ? <AppText color={colors.muted} style={styles.d}>{detail}</AppText> : null}
  </View>
);
const styles = StyleSheet.create({ w: { padding: spacing.xl, alignItems: 'center' }, d: { marginTop: spacing.sm, textAlign: 'center' } });
