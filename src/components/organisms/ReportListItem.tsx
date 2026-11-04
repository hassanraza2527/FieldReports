import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ListItem } from '../../domain/reportList';
import { toFileUri } from '../../platform/files';
import { colors, spacing, Tone } from '../../theme';
import { AppText } from '../atoms/AppText';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Card } from '../atoms/Card';
import { PhotoTile } from '../molecules/PhotoTile';

interface Props {
  item: ListItem;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  onDeleteServer: (id: string) => void;
}

export function describe(item: ListItem): { label: string; tone: Tone; note?: string } {
  if (item.source === 'server') return { label: 'Uploaded', tone: 'ok' };
  const r = item.report;
  if (r.state === 'synced') return { label: 'Uploaded', tone: 'ok' };
  if (r.state === 'failed') return { label: 'Needs attention', tone: 'attention', note: r.lastError ?? undefined };
  const sent = r.images.filter(i => i.state === 'uploaded').length;
  return {
    label: 'Saved on phone',
    tone: 'waiting',
    note: r.attempts > 0 ? `Retrying automatically (attempt ${r.attempts + 1}).` : sent > 0 ? `Photos ${sent}/${r.images.length} sent.` : 'Waiting to upload.',
  };
}

export const ReportListItem = ({ item, onRetry, onDiscard, onDeleteServer }: Props) => {
  const d = describe(item);
  const [open, setOpen] = useState(false);
  const thumbs =
    item.source === 'server'
      ? item.report.images.map(i => ({ id: i.id, uri: i.url }))
      : item.report.images.map(i => ({ id: i.id, uri: i.localPath ?? i.sourcePath ? toFileUri((i.localPath ?? i.sourcePath) as string) : null }));
  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Badge label={d.label} tone={d.tone} />
        <AppText variant="caption" color={colors.muted}>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</AppText>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Collapse report' : 'Expand report'} onPress={() => setOpen(o => !o)}>
        <AppText numberOfLines={open ? undefined : 3}>{item.report.description}</AppText>
        <AppText variant="caption" color={colors.primary}>{open ? 'Show less' : 'Show full report'}</AppText>
      </Pressable>
      {d.note ? <AppText variant="caption" color={d.tone === 'attention' ? colors.danger : colors.muted}>{d.note}</AppText> : null}
      <View style={styles.thumbs}>
        {thumbs.filter(t => t.uri).map(t => <PhotoTile key={t.id} uri={t.uri as string} size={open ? 150 : 56} />)}
      </View>
      {item.source === 'server' && open ? (
        <Button title="Delete report" variant="danger" onPress={() => onDeleteServer(item.id)} />
      ) : null}
      {item.source === 'local' && item.report.state === 'failed' ? (
        <View style={styles.actions}>
          <View style={styles.flex}><Button title="Retry" onPress={() => onRetry(item.id)} /></View>
          <View style={styles.flex}><Button title="Discard" variant="danger" onPress={() => onDiscard(item.id)} /></View>
        </View>
      ) : null}
    </Card>
  );
};
const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  flex: { flex: 1 },
});
