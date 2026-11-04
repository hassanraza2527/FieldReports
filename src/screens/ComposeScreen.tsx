import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { getContainer } from '../app/container';
import { Banner } from '../components/molecules/Banner';
import { ReportComposer } from '../components/organisms/ReportComposer';
import { ScreenTemplate } from '../components/templates/ScreenTemplate';
import { MAX_PHOTOS } from '../domain/types';
import { PickError, pickPhotos } from '../images/imageImport';
import { ensureCameraPermission, openAppSettings } from '../platform/permissions';
import { useDraftStore } from '../state/draftStore';
import { spacing } from '../theme';
import { files } from '../platform/files';
import { useSyncSummary } from './useSyncSummary';

export function ComposeScreen() {
  const { description, photos, setDescription, addPhotos, removePhoto, clear } = useDraftStore();
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summary = useSyncSummary();
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const pick = useCallback(async (source: 'camera' | 'library') => {
    setPicking(true);
    try {
      if (source === 'camera') {
        const perm = await ensureCameraPermission();
        if (perm !== 'granted') {
          Alert.alert(
            'Camera permission needed',
            perm === 'blocked' ? 'Enable the camera for this app in Settings, or choose photos from the gallery.' : 'Allow camera access to take photos, or choose photos from the gallery.',
            perm === 'blocked' ? [{ text: 'Not now', style: 'cancel' }, { text: 'Open settings', onPress: openAppSettings }] : [{ text: 'OK' }],
          );
          return;
        }
      }
      addPhotos(await pickPhotos(source, MAX_PHOTOS - useDraftStore.getState().photos.length));
    } catch (e) {
      Alert.alert('Could not add photo', e instanceof PickError ? e.message : 'Please try again.');
    } finally {
      setPicking(false);
    }
  }, [addPhotos]);

  const remove = useCallback((id: string) => {
    const p = useDraftStore.getState().photos.find(x => x.id === id);
    removePhoto(id);
    if (p) void files.remove(p.path).catch(() => undefined);
  }, [removePhoto]);

  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await getContainer().service.submit({ description, photoPaths: photos });
      clear(); // photo files now belong to the saved report
      setSaved(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), 5000);
    } catch {
      Alert.alert('Could not save', 'Nothing was lost: your draft is still here. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [clear, description, photos, submitting]);

  return (
    <ScreenTemplate title="New report" summary={summary}>
      <KeyboardAvoidingView style={styles.f} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.c} keyboardShouldPersistTaps="handled">
          {saved ? <Banner tone="ok" title="Saved on phone" detail="It will upload automatically when there is a connection." /> : null}
          <ReportComposer
            description={description}
            photos={photos}
            picking={picking}
            submitting={submitting}
            onDescription={setDescription}
            onCamera={() => void pick('camera')}
            onLibrary={() => void pick('library')}
            onRemovePhoto={remove}
            onSubmit={() => void submit()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenTemplate>
  );
}
const styles = StyleSheet.create({ f: { flex: 1 }, c: { padding: spacing.lg, gap: spacing.lg } });
