import ImageResizer from '@bam.tech/react-native-image-resizer';
import { dirs, files, stripScheme } from '../platform/files';
import { ImageCompressor } from '../upload/engine';
import { compressToLimit, ResizeFn } from './compression';

/**
 * Native resize + re-encode (off the JS thread, so the UI never freezes on an 18 MB photo).
 * The native encoder applies the EXIF orientation to the pixels and writes a fresh JPEG without metadata,
 * so photos are upright everywhere and GPS data is not uploaded.
 */
const resize: ResizeFn = async (src, { maxDimension, quality }) => {
  const r = await ImageResizer.createResizedImage(src, maxDimension, maxDimension, 'JPEG', quality, 0, dirs.ready, false, {
    mode: 'contain',
    onlyScaleDown: true,
  });
  const path = stripScheme(r.path ?? r.uri);
  return { path, size: r.size ?? (await files.sizeOf(path)) };
};

export const imageCompressor: ImageCompressor = {
  async compress(sourcePath, imageId) {
    await files.ensureDirs();
    const out = await compressToLimit(resize, sourcePath, p => files.remove(p));
    const final = `${dirs.ready}/${imageId}.jpg`;
    await files.remove(final);
    await files.move(out.path, final);
    return { path: final, size: out.size };
  },
};
