import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { getContainer } from '../app/container';
import { AppText } from '../components/atoms/AppText';
import { Button } from '../components/atoms/Button';
import { Card } from '../components/atoms/Card';
import { Banner } from '../components/molecules/Banner';
import { ScreenTemplate } from '../components/templates/ScreenTemplate';
import { useAuthStore } from '../state/authStore';
import { useQueueStore } from '../state/queueStore';
import { colors, spacing } from '../theme';
import { useSyncSummary } from './useSyncSummary';

export function SettingsScreen() {
  const reports = useQueueStore(s => s.reports);
  const online = useQueueStore(s => s.online);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const summary = useSyncSummary();
  const email = useAuthStore(s => s.email);
  const name = useAuthStore(s => s.name);
  const unsent = reports.filter(r => r.state !== 'synced').length;

  const confirmReset = () =>
    Alert.alert(
      'Reset local data?',
      `${unsent > 0 ? `${unsent} report${unsent === 1 ? '' : 's'} not yet uploaded will be permanently deleted from this phone. ` : ''}` +
        'Reports already on the server are NOT affected. The unsent draft and all saved photos on this phone are removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await getContainer().resetEverythingLocal();
              setDone(true);
            } catch {
              Alert.alert('Reset failed', 'Please try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  const confirmLogout = () =>
    Alert.alert(
      'Log out?',
      unsent > 0
        ? `${unsent} report${unsent === 1 ? '' : 's'} not yet uploaded will be permanently deleted from this phone. Wait for them to upload first, or log out anyway.`
        : 'You will need to log in again to add reports.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: unsent > 0 ? 'Log out and delete' : 'Log out',
          style: 'destructive',
          onPress: () => getContainer().logout().catch(() => Alert.alert('Log out failed', 'Please try again.')),
        },
      ],
    );

  return (
    <ScreenTemplate title="Settings" summary={summary}>
      <ScrollView contentContainerStyle={styles.c}>
        {done ? <Banner tone="ok" title="Local data cleared" detail="The server was not touched." /> : null}
        <Card style={styles.card}>
          <AppText variant="heading">Account</AppText>
          {name ? <AppText>{name}</AppText> : null}
          <AppText color={colors.muted}>{email ?? ''}</AppText>
          <Button title="Log out" variant="secondary" onPress={confirmLogout} />
        </Card>
        <Card style={styles.card}>
          <AppText variant="heading">Server</AppText>
          <AppText color={colors.muted}>{getContainer().baseUrl}</AppText>
          <AppText variant="caption" color={colors.muted}>{online ? 'Reachable' : 'Not reachable right now'}</AppText>
        </Card>
        <Card style={styles.card}>
          <AppText variant="heading">Reset local data</AppText>
          <AppText color={colors.muted}>
            Clears this phone's queue, saved photos and the unsent draft. Does not delete anything on the server and keeps you logged in.
          </AppText>
          <Button title="Reset local data" variant="danger" onPress={confirmReset} loading={busy} />
        </Card>
      </ScrollView>
    </ScreenTemplate>
  );
}
const styles = StyleSheet.create({ c: { padding: spacing.lg, gap: spacing.lg }, card: { gap: spacing.sm } });
