import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../../theme';
import { AppText } from '../atoms/AppText';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Card } from '../atoms/Card';

interface Props {
  /** null = still checking. */
  camera: boolean | null;
  onAllowCamera: () => void;
  onOpenSettings: () => void;
}

const Row = ({ title, detail, badge }: { title: string; detail: string; badge: React.ReactElement }) => (
  <View style={styles.row}>
    <View style={styles.text}>
      <AppText variant="label">{title}</AppText>
      <AppText variant="caption" color={colors.muted}>{detail}</AppText>
    </View>
    {badge}
  </View>
);

/** What the app is allowed to do, and the way to fix it. Presentational only: the screen owns the logic. */
export const PermissionsCard = ({ camera, onAllowCamera, onOpenSettings }: Props) => (
  <Card style={styles.card}>
    <AppText variant="heading">Permissions</AppText>
    <Row
      title="Camera"
      detail="Needed to take photos for a report."
      badge={camera === null ? <Badge label="Checking" /> : <Badge label={camera ? 'Allowed' : 'Not allowed'} tone={camera ? 'ok' : 'attention'} />}
    />
    <Row title="Photo library" detail="Uses the system picker, so no permission is needed." badge={<Badge label="Not required" />} />
    {camera === false ? (
      <>
        <Button title="Allow camera" onPress={onAllowCamera} />
        <AppText variant="caption" color={colors.muted}>If no dialog appears, the camera was blocked: open the app settings and switch it on.</AppText>
      </>
    ) : null}
    <Button title="Open app settings" variant="secondary" onPress={onOpenSettings} />
  </Card>
);
const styles = StyleSheet.create({
  card: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  text: { flex: 1 },
});
