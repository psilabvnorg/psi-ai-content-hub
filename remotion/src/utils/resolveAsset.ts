import { staticFile } from 'remotion';

/** Resolve an asset path: full URLs are used as-is, relative paths go through staticFile(). */
export const resolveAsset = (src: string): string =>
  src.startsWith('http://') || src.startsWith('https://')
    ? src
    : staticFile(src);
