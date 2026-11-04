import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SyncSummary } from '../../domain/syncSummary';
import { spacing, toneColors } from '../../theme';
import { AppText } from '../atoms/AppText';

/** Always visible: the inspector can tell at a glance whether anything still needs the network. */
export const SyncStatusStrip = ({ summary }: { summary: SyncSummary }) => {
  const c = toneColors[summary.tone];
  return (
    <View accessibilityRole="summary" accessibilityLiveRegion="polite" style={[styles.s, { backgroundColor: c.bg }]}>
      {summary.tone === 'busy' ? <ActivityIndicator size="small" color={c.fg} /> : null}
      <View style={styles.t}>
        <AppText variant="label" color={c.fg}>{summary.title}</AppText>
        {summary.detail ? <AppText variant="caption" color={c.fg}>{summary.detail}</AppText> : null}
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  s: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2 },
  t: { flex: 1 },
});
