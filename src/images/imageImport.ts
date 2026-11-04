import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { files } from '../platform/files';
import { newId } from '../platform/ids';

export interface PickedPhoto {
  id: string;
  /** Durable copy inside the app's private storage. Safe to keep for days offline. */
  path: string;
}
export class PickError extends Error {}

export async function pickPhotos(source: 'camera' | 'library', remaining: number): Promise<PickedPhoto[]> {
  if (remaining <= 0) return [];
  const res =
    source === 'camera'
      ? await launchCamera({ mediaType: 'photo', saveToPhotos: false, cameraType: 'back' })
      : await launchImageLibrary({ mediaType: 'photo', selectionLimit: remaining });
  if (res.didCancel) return [];
  if (res.errorCode) throw new PickError(res.errorMessage ?? res.errorCode);

  const out: PickedPhoto[] = [];
  for (const a of (res.assets ?? []).slice(0, remaining)) {
    if (!a.uri) continue;
    const id = newId();
    // Copy NOW: picker URIs live in a cache the OS may clear before the user submits or the network returns.
    out.push({ id, path: await files.copyIn(a.uri, id) });
  }
  return out;
}
