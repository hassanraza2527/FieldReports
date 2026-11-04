import { SAFE_IMAGE_BYTES, TARGET_IMAGE_BYTES } from '../domain/types';

export interface ResizeResult {
  path: string;
  size: number;
}
/** Native resize+re-encode to JPEG (runs off the JS thread). Injected so the policy is unit-testable. */
export type ResizeFn = (src: string, opts: { maxDimension: number; quality: number }) => Promise<ResizeResult>;

export class ImageTooLargeError extends Error {}

/** Biggest-to-smallest. A 12-20 MP / 18 MB photo normally fits the target on the very first rung (~0.4-1 MB). */
export const COMPRESSION_LADDER = [
  { maxDimension: 1920, quality: 80 },
  { maxDimension: 1600, quality: 70 },
  { maxDimension: 1280, quality: 60 },
  { maxDimension: 1024, quality: 50 },
  { maxDimension: 800, quality: 40 },
] as const;

/**
 * Walk the ladder until the file is <= targetBytes. Always re-encodes FROM THE ORIGINAL (never recompress a
 * compressed copy). If nothing reaches the target but something is under the hard limit, use the smallest.
 * Throws ImageTooLargeError only if even the smallest rung is >= SAFE_IMAGE_BYTES.
 */
export async function compressToLimit(
  resize: ResizeFn,
  src: string,
  discard: (path: string) => Promise<void>,
  targetBytes = TARGET_IMAGE_BYTES,
  hardLimit = SAFE_IMAGE_BYTES,
): Promise<ResizeResult> {
  let best: ResizeResult | null = null;
  for (const rung of COMPRESSION_LADDER) {
    const out = await resize(src, rung);
    if (out.size <= targetBytes) {
      if (best) await discard(best.path);
      return out;
    }
    if (!best || out.size < best.size) {
      if (best) await discard(best.path);
      best = out;
    } else {
      await discard(out.path);
    }
  }
  if (best && best.size < hardLimit) return best;
  if (best) await discard(best.path);
  throw new ImageTooLargeError('Could not compress the photo under the size limit');
}
