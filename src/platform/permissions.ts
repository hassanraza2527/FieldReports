import { Linking, PermissionsAndroid, Platform } from 'react-native';

export type CameraPermission = 'granted' | 'denied' | 'blocked';

/** Silent check (never shows a dialog). Always true on iOS here: the system asks on first use. */
export const isCameraGranted = async (): Promise<boolean> =>
  Platform.OS !== 'android' || PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);

/** Asks the user (Android shows the dialog only while it is still allowed to; afterwards the answer is 'blocked'). */
export async function ensureCameraPermission(): Promise<CameraPermission> {
  if (Platform.OS !== 'android') return 'granted';
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
    title: 'Camera access',
    message: 'Field Reports needs the camera to take photos for a report.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  if (res === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  return res === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
}

export const openAppSettings = () => Linking.openSettings();
