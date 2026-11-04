
import React, { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Platform,
  AppState,
  PermissionsAndroid,
  Linking,
} from 'react-native';

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

  // Camera permission state
  const [cameraPermission, setCameraPermission] = useState('checking');

  const summary = useSyncSummary();
  const email = useAuthStore(s => s.email);
  const name = useAuthStore(s => s.name);

  const unsent = reports.filter(r => r.state !== 'synced').length;

  // Check camera permission
  const checkCameraPermission = useCallback(async () => {
    try {
      if (Platform.OS !== 'android') {
        setCameraPermission('unavailable');
        return;
      }

      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.CAMERA,
      );

      setCameraPermission(granted ? 'granted' : 'denied');
    } catch (error) {
      console.warn('Camera permission check failed:', error);
      setCameraPermission('unavailable');
    }
  }, []);

  // Check permission when screen opens
  useEffect(() => {
    checkCameraPermission();
  }, [checkCameraPermission]);

  // Refresh permission when returning from phone settings
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      state => {
        if (state === 'active') {
          checkCameraPermission();
        }
      },
    );

    return () => subscription.remove();
  }, [checkCameraPermission]);

  // Request camera permission
  const handleCameraPermission = async () => {
    try {
      if (Platform.OS !== 'android') {
        Alert.alert(
          'Not supported',
          'This permission handler is configured for Android.',
        );
        return;
      }

      const currentPermission = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.CAMERA,
      );

      if (currentPermission) {
        setCameraPermission('granted');

        Alert.alert(
          'Camera Permission',
          'Camera permission is already enabled.',
        );

        return;
      }

      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Camera Permission',
          message:
            'This app needs camera access to capture photos for reports.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      );

      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        setCameraPermission('granted');

        Alert.alert(
          'Success',
          'Camera permission granted successfully.',
        );
      } else if (
        result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
      ) {
        setCameraPermission('blocked');

        Alert.alert(
          'Permission Blocked',
          'Camera permission has been blocked. Please enable it from your phone settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => Linking.openSettings(),
            },
          ],
        );
      } else {
        setCameraPermission('denied');

        Alert.alert(
          'Permission Denied',
          'Camera permission was not granted.',
        );
      }
    } catch (error) {
      console.warn('Camera permission request failed:', error);

      Alert.alert(
        'Error',
        'Unable to request camera permission. Please try again.',
      );
    }
  };

  // Camera permission button
  const onCameraPermissionPress = () => {
    if (cameraPermission === 'blocked') {
      Alert.alert(
        'Camera Permission',
        'Enable camera permission from your phone settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => Linking.openSettings(),
          },
        ],
      );
      return;
    }

    handleCameraPermission();
  };

  // Reset local data
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

  // Logout
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
          onPress: () =>
            getContainer()
              .logout()
              .catch(() =>
                Alert.alert('Log out failed', 'Please try again.'),
              ),
        },
      ],
    );

  return (
    <ScreenTemplate title="Settings" summary={summary}>
      <ScrollView contentContainerStyle={styles.c}>

        {done ? (
          <Banner
            tone="ok"
            title="Local data cleared"
            detail="The server was not touched."
          />
        ) : null}

        <Card style={styles.card}>
          <AppText variant="heading">Account</AppText>

          {name ? <AppText>{name}</AppText> : null}

          <AppText color={colors.muted}>
            {email ?? ''}
          </AppText>

          <Button
            title="Log out"
            variant="secondary"
            onPress={confirmLogout}
          />
        </Card>

        <Card style={styles.card}>
          <AppText variant="heading">Server</AppText>

          <AppText color={colors.muted}>
            {getContainer().baseUrl}
          </AppText>

          <AppText variant="caption" color={colors.muted}>
            {online ? 'Reachable' : 'Not reachable right now'}
          </AppText>
        </Card>

        {/* Camera Permission */}
       
<Card style={styles.card}>
  <AppText variant="heading">
    Camera Permission
  </AppText>

  <AppText color={colors.muted}>
    Manage camera access for capturing report photos.
  </AppText>

  <AppText color={colors.muted}>
    Current Status: {
      cameraPermission === 'granted'
        ? 'Granted'
        : cameraPermission === 'denied'
        ? 'Denied'
        : cameraPermission === 'blocked'
        ? 'Blocked'
        : 'Checking...'
    }
  </AppText>

  {cameraPermission === 'granted' ? (
    <Button
      title="Disable Camera Permission"
      variant="danger"
      onPress={() => {
        Alert.alert(
          'Disable Camera Permission?',
          'To disable camera access, open your phone settings and revoke camera permission.',
          [
            {
              text: 'Cancel',
              style: 'cancel',
            },
            {
              text: 'Open Settings',
              onPress: () => Linking.openSettings(),
            },
          ],
        );
      }}
    />
  ) : (
    <Button
      title={
        cameraPermission === 'blocked'
          ? 'Enable in Phone Settings'
          : 'Grant Camera Permission'
      }
      variant="secondary"
      onPress={onCameraPermissionPress}
    />
  )}

  <Button
    title="Refresh Permission Status"
    variant="secondary"
    onPress={checkCameraPermission}
  />
</Card>


        <Card style={styles.card}>
          <AppText variant="heading">
            Reset local data
          </AppText>

          <AppText color={colors.muted}>
            Clears this phone's queue, saved photos and the unsent draft. Does not delete anything on the server and keeps you logged in.
          </AppText>

          <Button
            title="Reset local data"
            variant="danger"
            onPress={confirmReset}
            loading={busy}
          />
        </Card>

      </ScrollView>
    </ScreenTemplate>
  );
}

const styles = StyleSheet.create({
  c: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  card: {
    gap: spacing.sm,
  },
});