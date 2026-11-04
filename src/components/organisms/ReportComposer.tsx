import React from 'react';
import { StyleSheet, View } from 'react-native';
import { draftErrorMessage, validateDraft } from '../../domain/validation';
import { PickedPhoto } from '../../images/imageImport';
import { colors, spacing } from '../../theme';
import { AppText } from '../atoms/AppText';
import { Button } from '../atoms/Button';
import { TextField } from '../atoms/TextField';
import { PhotoGrid } from './PhotoGrid';

interface Props {
  description: string;
  photos: PickedPhoto[];
  picking: boolean;
  submitting: boolean;
  onDescription: (v: string) => void;
  onCamera: () => void;
  onLibrary: () => void;
  onRemovePhoto: (id: string) => void;
  onSubmit: () => void;
}
export const ReportComposer = (p: Props) => {
  const errors = validateDraft(p.description, p.photos.length);
  const showDescErr = p.description.length > 0 && errors.includes('DESCRIPTION_BLANK');
  return (
    <View style={styles.w}>
      <TextField
        label="What did you find?"
        placeholder="e.g. Cracked pipe near gate 4"
        multiline
        value={p.description}
        onChangeText={p.onDescription}
        error={showDescErr ? draftErrorMessage.DESCRIPTION_BLANK : null}
      />
      <PhotoGrid photos={p.photos} busy={p.picking} onCamera={p.onCamera} onLibrary={p.onLibrary} onRemove={p.onRemovePhoto} />
      <View>
        <Button title="Save report" onPress={p.onSubmit} disabled={errors.length > 0} loading={p.submitting} testID="save-report" />
        {errors.length > 0 ? (
          <AppText variant="caption" color={colors.muted} style={styles.hint}>{errors.map(e => draftErrorMessage[e]).join(' ')}</AppText>
        ) : null}
      </View>
    </View>
  );
};
const styles = StyleSheet.create({ w: { gap: spacing.xl }, hint: { marginTop: spacing.sm, textAlign: 'center' } });
