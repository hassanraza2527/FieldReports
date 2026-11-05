import RNFS from 'react-native-fs';
import { FileOps } from '../upload/engine';

const base = `${RNFS.DocumentDirectoryPath}/reports`;
export const dirs = { pending: `${base}/pending`, ready: `${base}/ready` } as const;

export const stripScheme = (p: string) => p.replace(/^file:\/\//, '');
export const toFileUri = (p: string) => (p.startsWith('file://') || p.startsWith('http') ? p : `file://${p}`);

/**
 * Everything the queue needs lives in the app's private documents dir (not the cache, which the OS may purge,
 * and never the picker's temporary URI).
 */
export const files = {
  async ensureDirs() {
    await RNFS.mkdir(dirs.pending);
    await RNFS.mkdir(dirs.ready);
  },
  /** Copy a picker result (file:// or content://) into durable storage. */
  async copyIn(uri: string, id: string): Promise<string> {
    await files.ensureDirs();
    const dest = `${dirs.pending}/${id}.jpg`;
    await RNFS.copyFile(uri, dest);
    return dest;
  },
  exists: (p: string) => RNFS.exists(stripScheme(p)),
  async remove(p: string) {
    const path = stripScheme(p);
    if (await RNFS.exists(path)) await RNFS.unlink(path);
  },
  async move(from: string, to: string) {
    await RNFS.moveFile(stripScheme(from), to);
  },
  async sizeOf(p: string) {
    return Number((await RNFS.stat(stripScheme(p))).size);
  },
  /** Delete a picker temp file, but only if it lives in the app's own cache (never a file in the user's gallery). */
  async removePickerTemp(uri: string) {
    const path = stripScheme(decodeURI(uri));
    if (path.startsWith(RNFS.CachesDirectoryPath)) await files.remove(path);
  },
  async clearAll() {
    // The picker leaves full-size originals (an 18 MB camera shot each) in its cache: Reset must not leave them behind.
    for (const d of [dirs.pending, dirs.ready, `${RNFS.CachesDirectoryPath}/rn_image_picker_lib_temp`]) {
      if (await RNFS.exists(d)) await RNFS.unlink(d);
    }
    await files.ensureDirs();
  },
} satisfies FileOps & Record<string, unknown>;
