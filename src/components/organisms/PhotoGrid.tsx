import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MAX_PHOTOS } from '../../domain/types';
import { PickedPhoto } from '../../images/imageImport';
import { toFileUri } from '../../platform/files';
import { colors, spacing } from '../../theme';
import { AppText } from '../atoms/AppText';
import { Button } from '../atoms/Button';
import { PhotoTile } from '../molecules/PhotoTile';

interface Props {
  photos: PickedPhoto[];
  busy: boolean;
  onCamera: () => void;
  onLibrary: () => void;
  onRemove: (id: string) => void;
}
export const PhotoGrid = ({ photos, busy, onCamera, onLibrary, onRemove }: Props) => {
  const full = photos.length >= MAX_PHOTOS;
  return (
    <View>
      <AppText variant="label" style={styles.label}>Photos ({photos.length}/{MAX_PHOTOS})</AppText>
      {photos.length > 0 ? (
        <View style={styles.grid}>
          {photos.map(p => <PhotoTile key={p.id} uri={toFileUri(p.path)} onRemove={() => onRemove(p.id)} />)}
        </View>
      ) : (
        <AppText variant="caption" color={colors.muted} style={styles.hint}>Add 1 to {MAX_PHOTOS} photos.</AppText>
      )}
      <View style={styles.row}>
        <View style={styles.flex}><Button title="Take photo" variant="secondary" onPress={onCamera} disabled={full || busy} /></View>
        <View style={styles.flex}><Button title="From gallery" variant="secondary" onPress={onLibrary} disabled={full || busy} /></View>
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  hint: { marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
