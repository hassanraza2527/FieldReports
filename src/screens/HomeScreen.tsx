import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import React, { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '../components/atoms/AppText';
import { Badge } from '../components/atoms/Badge';
import { Button } from '../components/atoms/Button';
import { Card } from '../components/atoms/Card';
import { describe } from '../components/organisms/ReportListItem';
import { ScreenTemplate } from '../components/templates/ScreenTemplate';
import { mergeReports } from '../domain/reportList';
import { TabParamList } from '../navigation/types';
import { useServerReports } from '../queries/useServerReports';
import { useQueueStore } from '../state/queueStore';
import { colors, spacing } from '../theme';
import { useSyncSummary } from './useSyncSummary';

const RECENT = 3;

export function HomeScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList>>();
  const local = useQueueStore(s => s.reports);
  const { data, isFetching, refetch } = useServerReports();
  const summary = useSyncSummary();
  const items = useMemo(() => mergeReports(local, data ?? []), [local, data]);
  useFocusEffect(useCallback(() => void refetch(), [refetch]));

  const uploaded = data?.length ?? 0;
  const waiting = local.filter(r => r.state !== 'synced').length;

  return (
    <ScreenTemplate title="Home" summary={summary}>
      <ScrollView contentContainerStyle={styles.c} refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => void refetch()} />}>
        <Card style={styles.hero}>
          <AppText variant="title">Field reports</AppText>
          <AppText color={colors.muted}>Write a description, add up to 5 photos and save. It uploads by itself, even from a weak connection.</AppText>
          <Button title="New report" onPress={() => navigation.navigate('Compose')} />
        </Card>

        <View style={styles.stats}>
          <Card style={styles.stat}>
            <AppText variant="title">{uploaded}</AppText>
            <AppText variant="caption" color={colors.muted}>Uploaded</AppText>
          </Card>
          <Card style={styles.stat}>
            <AppText variant="title" color={waiting > 0 ? colors.warn : colors.text}>{waiting}</AppText>
            <AppText variant="caption" color={colors.muted}>Waiting to upload</AppText>
          </Card>
        </View>

        <View style={styles.row}>
          <AppText variant="heading">Recent reports</AppText>
          {items.length > RECENT ? <AppText variant="label" color={colors.primary} onPress={() => navigation.navigate('Reports')}>See all</AppText> : null}
        </View>
        {items.length === 0 ? (
          <Card><AppText color={colors.muted}>No reports yet. Tap "New report" to create your first one.</AppText></Card>
        ) : (
          items.slice(0, RECENT).map(item => {
            const d = describe(item);
            return (
              <Card key={`${item.source}:${item.id}`} style={styles.recent}>
                <View style={styles.row}>
                  <Badge label={d.label} tone={d.tone} />
                  <AppText variant="caption" color={colors.muted}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}</AppText>
                </View>
                <AppText numberOfLines={2}>{item.report.description}</AppText>
              </Card>
            );
          })
        )}
        {items.length > 0 ? <Button title="View all reports" variant="secondary" onPress={() => navigation.navigate('Reports')} /> : null}
      </ScrollView>
    </ScreenTemplate>
  );
}
const styles = StyleSheet.create({
  c: { padding: spacing.lg, gap: spacing.md },
  hero: { gap: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.md },
  stat: { flex: 1, gap: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recent: { gap: spacing.sm },
});
