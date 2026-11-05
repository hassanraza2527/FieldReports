import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import React, { useCallback, useEffect, useMemo } from 'react';
import { Alert, Pressable } from 'react-native';
import { AppText } from '../components/atoms/AppText';
import { getContainer } from '../app/container';
import { Banner } from '../components/molecules/Banner';
import { ReportList } from '../components/organisms/ReportList';
import { ScreenTemplate } from '../components/templates/ScreenTemplate';
import { mergeReports } from '../domain/reportList';
import { TabParamList } from '../navigation/types';
import { useServerReports } from '../queries/useServerReports';
import { useQueueStore } from '../state/queueStore';
import { colors } from '../theme';
import { useSyncSummary } from './useSyncSummary';

export function ReportsScreen() {
  const { data, error, isFetching, refetch } = useServerReports();
  const local = useQueueStore(s => s.reports);
  const summary = useSyncSummary();
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList>>();
  const items = useMemo(() => mergeReports(local, data ?? []), [local, data]);

  useFocusEffect(useCallback(() => void refetch(), [refetch]));

  // The server's list is the proof of delivery: once it shows a report, its local row can go.
  useEffect(() => {
    if (data?.length) void getContainer().service.pruneConfirmed(data.map(r => r.id));
  }, [data]);

  const discard = useCallback((id: string) => {
    Alert.alert('Discard this report?', 'It has not been uploaded and will be permanently deleted from this phone.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void getContainer().service.discard(id) },
    ]);
  }, []);

  return (
    <ScreenTemplate
      title="Reports"
      summary={summary}
      right={
        <Pressable accessibilityRole="button" hitSlop={12} onPress={() => navigation.navigate('Compose')}>
          <AppText variant="label" color={colors.primary}>+ New report</AppText>
        </Pressable>
      }>
      <ReportList
        items={items}
        refreshing={isFetching}
        onRefresh={() => void refetch()}
        onRetry={id => void getContainer().service.retry(id)}
        onDiscard={discard}
        header={error ? <Banner tone="waiting" title="Can't reach the server" detail="Showing what is saved on this phone. Pull down to retry." /> : null}
      />
    </ScreenTemplate>
  );
}
