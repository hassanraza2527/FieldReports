import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { isCameraGranted } from '../platform/permissions';

/**
 * Live camera-permission status. Re-checked when the tab gets focus and whenever the app returns to the foreground,
 * so a permission granted in system Settings shows up without restarting the app.
 * `null` = not checked yet.
 */
export function usePermissions() {
  const [camera, setCamera] = useState<boolean | null>(null);
  const refresh = useCallback(async () => setCamera(await isCameraGranted()), []);

  useFocusEffect(useCallback(() => void refresh(), [refresh]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { camera, refresh };
}
