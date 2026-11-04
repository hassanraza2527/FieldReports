import { Linking, PermissionsAndroid, Platform } from 'react-native';

export type CameraPermission = 'granted' | 'denied' | 'blocked';

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
