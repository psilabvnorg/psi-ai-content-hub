import type { CalculateMetadataFunction } from 'remotion';
import { staticFile } from 'remotion';
import { getAudioDuration } from '../utils/getAudioDuration';
import {
  getSliderImagesForContentDirectory,
  getFirstAudioFromDirectory,
  getCaptionFileForAudio,
} from '../utils/getStaticAssets';
import { normalizeCaptions } from '../utils/normalizeCaptions';
import type { NewsVideoProps } from './NewsVideo';

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

export const calculateNewsVideoMetadata: CalculateMetadataFunction<NewsVideoProps> = async ({ props }) => {
  const fps = 30;

  console.log(`\n========== METADATA CALCULATION ==========`);
  console.log(`Content Directory: ${props.contentDirectory}`);

  // Use locked orientation/backgroundMode from wrapper compositions to pick specific config files.
  // Specific files (e.g. video-config-vertical-nobg.json) take priority over the generic fallback.
  const propsOrientation = props.orientation ?? 'vertical';
  const propsBackgroundMode = props.backgroundMode ?? false;
  const orientationKey = propsOrientation === 'horizontal' ? 'horizontal' : 'vertical';
  const bgKey = propsBackgroundMode ? 'bg' : 'nobg';

  const videoConfig =
    (props.videoConfigFilename
      ? await loadJsonConfig(props.contentDirectory, props.videoConfigFilename)
      : null) ??
    await loadJsonConfig(props.contentDirectory, `video-config-${orientationKey}-${bgKey}.json`) ??
    await loadJsonConfig(props.contentDirectory, 'video-config.json');

  // props values (FIXED constants from variant wrappers) take priority over video-config.json.
  // introDurationInFrames and imageDurationInFrames remain config-overridable (legitimately tunable per content).
  const orientation = (videoConfig?.orientation as string ?? propsOrientation) as 'vertical' | 'horizontal';
  const backgroundMode = (videoConfig?.backgroundMode as boolean) ?? propsBackgroundMode;
  const introDurationInFrames = (videoConfig?.introDurationInFrames as number) ?? props.introDurationInFrames;
  const imageDurationInFrames = (videoConfig?.imageDurationInFrames as number) ?? props.imageDurationInFrames;

  const isHorizontal = orientation === 'horizontal';
  // Specific configs use plain overlayImage; generic fallback supports overlayImageVertical/Horizontal keys.
  const overlayImage =
    (videoConfig?.overlayImage as string | undefined) ??
    (isHorizontal
      ? (videoConfig?.overlayImageHorizontal as string | undefined)
      : (videoConfig?.overlayImageVertical as string | undefined)) ??
    props.overlayImage;
  const backgroundOverlayImage =
    (videoConfig?.backgroundOverlayImage as string | undefined) ?? props.backgroundOverlayImage;
  const captionBottomPercent =
    (videoConfig?.captionBottomPercent as number | undefined) ?? props.captionBottomPercent ?? 20;
  const width = isHorizontal ? 1920 : 1080;
  const height = isHorizontal ? 1080 : 1920;
  console.log(`Orientation: ${orientation} (${width}x${height})`);

  // Load simplified intro config: { image1, image2, heroImage }
  const introConfig =
    await loadJsonConfig(props.contentDirectory, `intro-config-${orientationKey}-${bgKey}.json`) ??
    await loadJsonConfig(props.contentDirectory, 'intro-config.json');
  const defaultImage1 = isHorizontal ? 'templates/news-intro-horizontal/left.png' : 'templates/news-intro-vertical/top.png';
  const defaultImage2 = isHorizontal ? 'templates/news-intro-horizontal/right.png' : 'templates/news-intro-vertical/bottom.png';
  const defaultHero = isHorizontal ? 'templates/news-intro-horizontal/hero.png' : 'templates/news-intro-vertical/hero.png';

  const trim = (v: unknown, fallback: string) => ((v as string)?.trim()) || fallback;

  const configImage1 = introConfig?.image1 as string | undefined;
  const configImage2 = introConfig?.image2 as string | undefined;

  // Reject intro-config image paths that belong to the opposite orientation.
  // heroImage is orientation-agnostic and always flows through unchanged.
  const isOrientationMismatch = (path: string | undefined): boolean => {
    if (!path) return false;
    if (isHorizontal && path.includes('vertical')) return true;
    if (!isHorizontal && path.includes('horizontal')) return true;
    return false;
  };

  const introProps = {
    image1: isOrientationMismatch(configImage1)
      ? (props.introProps.image1 || defaultImage1)
      : trim(configImage1, props.introProps.image1 || defaultImage1),
    image2: isOrientationMismatch(configImage2)
      ? (props.introProps.image2 || defaultImage2)
      : trim(configImage2, props.introProps.image2 || defaultImage2),
    heroImage: trim(introConfig?.heroImage, props.introProps.heroImage || defaultHero),
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

  // Load section mapping (optional — used by education-style content)
  const sectionMapping = await loadJsonConfig(props.contentDirectory, 'section-mapping.json');
  const sections = Array.isArray(sectionMapping?.sections)
    ? (sectionMapping.sections as Array<{ title: string; startMs: number }>)
    : [];
  if (sections.length > 0) console.log(`Sections: ${sections.length} loaded`);

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
      overlayImage,
      backgroundOverlayImage,
      captionBottomPercent,
      introDurationInFrames,
      images,
      videos: [],
      audioSrc: audioSrc || undefined,
      videoDurations: [],
      captions,
      imageDurationInFrames,
      sections,
    },
  };
};
