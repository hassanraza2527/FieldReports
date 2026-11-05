import React from 'react';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';
import { ListItem } from '../../domain/reportList';
import { spacing } from '../../theme';
import { EmptyState } from '../molecules/EmptyState';
import { ReportListItem } from './ReportListItem';

interface Props {
  items: ListItem[];
  refreshing: boolean;
  onRefresh: () => void;
  header?: React.ReactElement | null;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
}
export const ReportList = ({ items, refreshing, onRefresh, header, onRetry, onDiscard }: Props) => (
  <FlatList
    data={items}
    keyExtractor={i => `${i.source}:${i.id}`}
    renderItem={({ item }) => <ReportListItem item={item} onRetry={onRetry} onDiscard={onDiscard} />}
    contentContainerStyle={styles.c}
    ListHeaderComponent={header ?? undefined}
    ListEmptyComponent={<EmptyState title="No reports yet" detail="Reports you save appear here once the server has them." />}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    initialNumToRender={6}
    windowSize={7}
  />
);
const styles = StyleSheet.create({ c: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 } });
