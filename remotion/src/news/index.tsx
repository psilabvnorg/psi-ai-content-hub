import { AbsoluteFill, Audio, Img, Sequence, staticFile, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { NewsIntroVertical } from '../components/NewsIntroVertical';
import { NewsIntroHorizontal } from '../components/NewsIntroHorizontal';
import { LoopingImageSlider } from '../components/LoopingImageSlider';
import { CaptionDisplay } from '../components/CaptionDisplay';
import type { Caption } from '@remotion/captions';

const introPropsSchema = z.object({
  image1: z.string().default(''),      // top (vertical) / left (horizontal)
  image2: z.string().default(''),      // bottom overlay (vertical) / right overlay (horizontal)
  heroImage: z.string().default(''),
});

export const mainVideoSchema = z.object({
  introProps: introPropsSchema,
  contentDirectory: z.string().describe('Directory path for content assets (e.g., main/video_1)'),
  images: z.array(z.string()).default([]),
  videos: z.array(z.string()).default([]),
  videoDurations: z.array(z.number()).default([]),
  audioSrc: z.string().optional(),
  captions: z.array(z.any()).optional(),
  orientation: z.enum(['vertical', 'horizontal']).default('vertical'),
  backgroundMode: z.boolean().default(false),
  introDurationInFrames: z.number(),
  imageDurationInFrames: z.number(),
});

export type MainVideoProps = z.infer<typeof mainVideoSchema>;

// Default overlay images when none specified in intro-config
const DEFAULT_OVERLAY_VERTICAL = 'templates/news-intro-vertical/bottom.png';
const DEFAULT_OVERLAY_HORIZONTAL = 'templates/news-intro-horizontal/right.png';

export const News: React.FC<MainVideoProps> = ({
  introProps,
  images,
  audioSrc,
  captions,
  backgroundMode = false,
  introDurationInFrames,
  imageDurationInFrames,
  orientation = 'vertical',
}) => {
  const { durationInFrames: totalDuration } = useVideoConfig();
  const isHorizontal = orientation === 'horizontal';

  const effectiveIntroDuration = backgroundMode ? totalDuration : introDurationInFrames;
  const mediaStartFrame = backgroundMode ? 0 : introDurationInFrames;

  const overlayImage = isHorizontal
    ? (introProps.image2 || DEFAULT_OVERLAY_HORIZONTAL)
    : (introProps.image2 || DEFAULT_OVERLAY_VERTICAL);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* LAYER 1 (BOTTOM): Sliding images */}
      <AbsoluteFill style={{ zIndex: 1 }}>
        <LoopingImageSlider
          images={images}
          startFrame={mediaStartFrame}
          totalDurationInFrames={totalDuration}
          slideDurationInFrames={imageDurationInFrames}
          isBackgroundMode={backgroundMode}
        />
      </AbsoluteFill>

      {/* LAYER 2: Intro overlay */}
      <Sequence durationInFrames={effectiveIntroDuration} layout="none">
        {backgroundMode ? (
          // Background mode: just the overlay PNG on top of sliding images
          <AbsoluteFill style={{ zIndex: 10 }}>
            <Img
              src={staticFile(overlayImage)}
              style={{ width: '100%', height: '100%', objectFit: 'fill' }}
            />
          </AbsoluteFill>
        ) : isHorizontal ? (
          <NewsIntroHorizontal
            leftImage={introProps.image1}
            rightImage={introProps.image2}
            heroImage={introProps.heroImage}
          />
        ) : (
          <NewsIntroVertical
            topImage={introProps.image1}
            bottomImage={introProps.image2}
            heroImage={introProps.heroImage}
          />
        )}
      </Sequence>

      {/* AUDIO */}
      {audioSrc && <Audio src={audioSrc} />}

      {/* CAPTIONS */}
      {captions && captions.length > 0 && (
        <AbsoluteFill style={{ zIndex: 100 }}>
          <CaptionDisplay captions={captions as Caption[]} introDurationInFrames={0} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
