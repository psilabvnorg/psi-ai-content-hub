import type { CalculateMetadataFunction } from 'remotion';
import { staticFile } from 'remotion';
import { z } from 'zod';
import { getAudioDuration } from '../utils/getAudioDuration';
import {
  getSliderImagesForContentDirectory,
  getAudioFromDirectory,
} from '../utils/getStaticAssets';

// ─── Schema ────────────────────────────────────────────────────────────────────

export const musicPlaylistSchema = z.object({
  contentDirectory: z.string().describe('Directory path for content assets (e.g., main/music-playlist)'),
  orientation: z.enum(['vertical', 'horizontal']).default('vertical').describe('Video orientation'),
  audioFiles: z.array(z.string()).default([]).describe('Resolved audio file paths (filled by calculateMetadata)'),
  audioDurationsInFrames: z.array(z.number()).default([]).describe('Duration per track in frames'),
  images: z.array(z.string()).default([]).describe('Shuffled image paths (filled by calculateMetadata)'),
  imageDurationInFrames: z.number().default(300).describe('Duration per image in frames (10s @ 30fps)'),
  artistName: z.string().default('').describe('Artist / channel name displayed below track title'),
  accentColor: z.string().default('#A855F7').describe('Accent color for waveform and title text'),
  waveformStyle: z.enum(['bars', 'wave']).default('bars').describe('Sound wave style'),
  numberOfBars: z.number().default(64).describe('Number of bars in bars mode (must be power of 2 friendly)'),
  title: z.string().default('').describe('Fixed title shown throughout the clip (overrides filename-derived title)'),
  heroImage: z.string().default('').describe('Consistent image shown in the cover art box throughout the clip'),
  textBackgroundColor: z.string().default('#000000').describe('Background color behind the title + artist text block'),
  textBackgroundOpacity: z.number().min(0).max(1).default(0.45).describe('Opacity of the text background (0–1)'),
});

export type MusicPlaylistProps = z.infer<typeof musicPlaylistSchema>;

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Load a JSON config file from {contentDirectory}/config/{filename}
 */
const loadJsonConfig = async (
  contentDirectory: string,
  filename: string,
): Promise<Record<string, unknown> | null> => {
  try {
    const configPath = staticFile(`${contentDirectory}/config/${filename}`);
    const response = await fetch(configPath + `?t=${Date.now()}`);
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // config file is optional
  }
  return null;
};

/**
 * Deterministic Fisher-Yates shuffle using a simple LCG seeded by a string.
 */
const deterministicShuffle = <T>(arr: T[], seed: string): T[] => {
  let s = seed.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ─── calculateMetadata ────────────────────────────────────────────────────────

export const calculateMusicPlaylistMetadata: CalculateMetadataFunction<
  MusicPlaylistProps
> = async ({ props }) => {
  const fps = 30;

  console.log(`\n========== MUSIC PLAYLIST METADATA ==========`);
  console.log(`Content Directory: ${props.contentDirectory}`);

  // Load optional video-config.json
  const videoConfig = await loadJsonConfig(props.contentDirectory, 'video-config.json');

  const orientation = (
    (videoConfig?.orientation as string) ?? props.orientation ?? 'vertical'
  ) as 'vertical' | 'horizontal';

  const imageDurationInFrames =
    (videoConfig?.imageDurationInFrames as number) ?? props.imageDurationInFrames;

  const artistName =
    (videoConfig?.artistName as string) ?? props.artistName ?? '';

  const accentColor =
    (videoConfig?.accentColor as string) ?? props.accentColor ?? '#A855F7';

  const waveformStyle = (
    (videoConfig?.waveformStyle as string) ?? props.waveformStyle ?? 'bars'
  ) as 'bars' | 'wave';

  const numberOfBars =
    (videoConfig?.numberOfBars as number) ?? props.numberOfBars ?? 64;

  const title = (videoConfig?.title as string) ?? props.title ?? '';

  const textBackgroundColor =
    (videoConfig?.textBackgroundColor as string) ?? props.textBackgroundColor ?? '#000000';

  const textBackgroundOpacity =
    (videoConfig?.textBackgroundOpacity as number) ?? props.textBackgroundOpacity ?? 0.45;

  // heroImage: resolve to staticFile path if it's a relative asset path
  let heroImage = (videoConfig?.heroImage as string) ?? props.heroImage ?? '';
  if (heroImage && !heroImage.startsWith('http') && !heroImage.startsWith('/')) {
    heroImage = staticFile(heroImage);
  }

  // Dimensions
  const isHorizontal = orientation === 'horizontal';
  const width = isHorizontal ? 1920 : 1080;
  const height = isHorizontal ? 1080 : 1920;
  console.log(`Orientation: ${orientation} (${width}x${height})`);

  // Load all audio files from /audio subfolder
  const audioDir = `${props.contentDirectory}/audio`;
  const audioFiles =
    props.audioFiles.length > 0
      ? props.audioFiles
      : getAudioFromDirectory(audioDir);

  console.log(`Audio files (${audioFiles.length}):`, audioFiles);

  // Load images (prefers /image subfolder)
  const rawImages = getSliderImagesForContentDirectory(props.contentDirectory);
  const shuffledImages = deterministicShuffle(rawImages, props.contentDirectory);
  console.log(`Images (${shuffledImages.length}):`, shuffledImages);

  // Calculate duration for each audio file in parallel
  const audioDurationsInSeconds = await Promise.all(
    audioFiles.map((src) => getAudioDuration(src).catch(() => 0)),
  );

  const audioDurationsInFrames = audioDurationsInSeconds.map((sec) =>
    Math.ceil(sec * fps),
  );

  const totalFrames = audioDurationsInFrames.reduce((sum, d) => sum + d, 0) || fps * 10;

  console.log(
    `Track durations (frames):`,
    audioDurationsInFrames,
    `| Total: ${totalFrames} frames (${(totalFrames / fps).toFixed(1)}s)`,
  );
  console.log(`==============================================\n`);

  return {
    fps,
    durationInFrames: totalFrames,
    width,
    height,
    props: {
      ...props,
      orientation,
      audioFiles,
      audioDurationsInFrames,
      images: shuffledImages,
      imageDurationInFrames,
      artistName,
      accentColor,
      waveformStyle,
      numberOfBars,
      title,
      heroImage,
      textBackgroundColor,
      textBackgroundOpacity,
    },
  };
};
