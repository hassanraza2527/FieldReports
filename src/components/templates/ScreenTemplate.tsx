import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SyncSummary } from '../../domain/syncSummary';
import { colors, spacing } from '../../theme';
import { AppText } from '../atoms/AppText';
import { SyncStatusStrip } from '../organisms/SyncStatusStrip';

interface Props {
  title: string;
  summary?: SyncSummary;
  /** Optional action shown at the right of the title (e.g. "+ New report"). */
  right?: React.ReactNode;
  children: React.ReactNode;
}
export const ScreenTemplate = ({ title, summary, right, children }: Props) => (
  <SafeAreaView style={styles.s} edges={['top']}>
    <View style={styles.h}>
      <AppText variant="title">{title}</AppText>
      {right}
    </View>
    {summary ? <SyncStatusStrip summary={summary} /> : null}
    <View style={styles.b}>{children}</View>
  </SafeAreaView>
);
const styles = StyleSheet.create({
  s: { flex: 1, backgroundColor: colors.bg },
  h: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  b: { flex: 1 },
});
