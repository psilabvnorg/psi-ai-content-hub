import type { CalculateMetadataFunction } from 'remotion';
import { staticFile } from 'remotion';
import { getAudioDuration } from '../utils/getAudioDuration';
import {
  getSliderImagesForContentDirectory,
  getFirstAudioFromDirectory,
  getCaptionFileForAudio,
} from '../utils/getStaticAssets';
import { normalizeCaptions } from '../utils/normalizeCaptions';
import type { MainVideoProps } from './index';

const loadJsonConfig = async (contentDirectory: string, filename: string): Promise<Record<string, unknown> | null> => {
  try {
    const configPath = staticFile(`${contentDirectory}/config/${filename}`);
    const response = await fetch(configPath + `?t=${Date.now()}`);
    if (response.ok) {
      const config = await response.json();
      console.log(`Loaded config from: ${configPath}`);
      return config;
    }
  } catch (error) {
    console.warn(`No ${filename} found, using defaults`);
  }
  return null;
};

export const calculateMainVideoMetadata: CalculateMetadataFunction<MainVideoProps> = async ({ props }) => {
  const fps = 30;

  console.log(`\n========== METADATA CALCULATION ==========`);
  console.log(`Content Directory: ${props.contentDirectory}`);

  const videoConfig = await loadJsonConfig(props.contentDirectory, 'video-config.json');
  const orientation = ((videoConfig?.orientation as string) ?? props.orientation ?? 'vertical') as 'vertical' | 'horizontal';
  const backgroundMode = (videoConfig?.backgroundMode as boolean) ?? props.backgroundMode ?? false;
  const introDurationInFrames = (videoConfig?.introDurationInFrames as number) ?? props.introDurationInFrames;
  const imageDurationInFrames = (videoConfig?.imageDurationInFrames as number) ?? props.imageDurationInFrames;

  const isHorizontal = orientation === 'horizontal';
  const width = isHorizontal ? 1920 : 1080;
  const height = isHorizontal ? 1080 : 1920;
  console.log(`Orientation: ${orientation} (${width}x${height})`);

  // Load simplified intro config: { image1, image2, heroImage }
  const introConfig = await loadJsonConfig(props.contentDirectory, 'intro-config.json');
  const defaultImage1 = isHorizontal ? 'templates/news-intro-horizontal/left.png' : 'templates/news-intro-vertical/top.png';
  const defaultImage2 = isHorizontal ? 'templates/news-intro-horizontal/right.png' : 'templates/news-intro-vertical/bottom.png';
  const defaultHero = isHorizontal ? 'templates/news-intro-horizontal/hero.png' : 'templates/news-intro-vertical/hero.png';

  const introProps = {
    image1: (introConfig?.image1 as string) || props.introProps.image1 || defaultImage1,
    image2: (introConfig?.image2 as string) || props.introProps.image2 || defaultImage2,
    heroImage: (introConfig?.heroImage as string) || props.introProps.heroImage || defaultHero,
  };

  const images = (!props.images || props.images.length === 0)
    ? getSliderImagesForContentDirectory(props.contentDirectory)
    : props.images;

  const audioSrc = props.audioSrc || getFirstAudioFromDirectory(`${props.contentDirectory}/audio`);
  console.log(`Audio Source: ${audioSrc}`);

  let captionsSource: unknown = props.captions;
  if ((!Array.isArray(captionsSource) || captionsSource.length === 0) && audioSrc) {
    try {
      const audioDir = `${props.contentDirectory}/audio`;
      const captionPath = getCaptionFileForAudio(audioSrc, audioDir);
      if (captionPath) {
        const response = await fetch(captionPath + `?t=${Date.now()}`);
        if (response.ok) {
          captionsSource = await response.json();
          console.log(`Loaded captions from: ${captionPath}`);
        }
      }
    } catch (error) {
      console.warn(`Could not load captions:`, error);
      captionsSource = [];
    }
  }

  const captions = normalizeCaptions(captionsSource);
  console.log(`==========================================\n`);

  const audioDuration = audioSrc ? await getAudioDuration(audioSrc) : 0;
  const slideshowDurationSec = audioDuration > 0 ? audioDuration : images.length * 5;
  const contentDurationSec = backgroundMode
    ? slideshowDurationSec
    : introDurationInFrames / fps + slideshowDurationSec;
  const totalDuration = Math.max(audioDuration, contentDurationSec);

  return {
    fps,
    durationInFrames: Math.ceil(totalDuration * fps),
    width,
    height,
    props: {
      ...props,
      orientation,
      introProps,
      backgroundMode,
      introDurationInFrames,
      images,
      videos: [],
      audioSrc: audioSrc || undefined,
      videoDurations: [],
      captions,
      imageDurationInFrames,
    },
  };
};
