// NewsVideo — shared render engine for all 4 news compositions
//
// Layer stack (bottom → top):
//   zIndex  1  LAYER 1 : LoopingImageSlider   — always starts after intro ends (introDurationInFrames);
//                                                visible under static overlay (backgroundMode) or fullscreen (noBackground)
//   zIndex 10  LAYER 2a: Animated intro        — [0 … introDurationInFrames)  all variants
//   zIndex 10  LAYER 2b: Static overlay image  — [introDurationInFrames … end) backgroundMode only
//   zIndex 50  LAYER 3 : SectionSlider         — optional chapter markers
//              AUDIO   : plays from frame 0
//   zIndex100  CAPTIONS: appear after intro ends (introDurationInFrames)

import { AbsoluteFill, Html5Audio, Img, Sequence, staticFile, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { NewsIntroVertical } from './NewsIntroVertical';
import { NewsIntroHorizontal } from './NewsIntroHorizontal';
import { LoopingImageSlider } from './LoopingImageSlider';
import { CaptionDisplay } from './CaptionDisplay';
import { SectionSlider } from './SectionSlider';
import type { Caption } from '@remotion/captions';

// ─── Schema ──────────────────────────────────────────────────────────────────

export const newsVideoSchema = z.object({
  // Intro template images.
  // vertical:   image1 = top half background,  image2 = full-screen overlay (bottom.png)
  // horizontal: image1 = left half background, image2 = full-screen overlay (right.png)
  // image2 is also reused as the static post-intro overlay in backgroundMode.
  introProps: z.object({
    image1: z.string().default(''),
    image2: z.string().default(''),
    heroImage: z.string().default(''),
  }),
  contentDirectory: z.string().describe('e.g. "main/news" — base path inside public/'),
  images: z.array(z.string()).default([]),
  videos: z.array(z.string()).default([]),
  videoDurations: z.array(z.number()).default([]),
  audioSrc: z.string().optional(),
  captions: z.array(z.any()).optional(),
  orientation: z.enum(['vertical', 'horizontal']).default('vertical'),
  // backgroundMode = true  → static overlay shows after intro; images visible underneath throughout
  // backgroundMode = false → no overlay after intro; images only start after intro ends
  backgroundMode: z.boolean().default(false),
  introDurationInFrames: z.number(),
  imageDurationInFrames: z.number(),
  sections: z.array(z.object({ title: z.string(), startMs: z.number() })).default([]),
});

export type NewsVideoProps = z.infer<typeof newsVideoSchema>;

// ─── Fallback overlay images (used when introProps.image2 is empty) ───────────

const FALLBACK_OVERLAY_VERTICAL   = 'templates/news-intro-vertical/bottom.png';
const FALLBACK_OVERLAY_HORIZONTAL = 'templates/news-intro-horizontal/right.png';

// ─── Component ───────────────────────────────────────────────────────────────

export const NewsVideo: React.FC<NewsVideoProps> = ({
  introProps,
  images,
  audioSrc,
  captions,
  backgroundMode = false,
  introDurationInFrames,
  imageDurationInFrames,
  orientation = 'vertical',
  sections = [],
}) => {
  const { durationInFrames: totalDuration } = useVideoConfig();
  const isHorizontal = orientation === 'horizontal';

  // The slider always starts after the intro ends to avoid bleeding through the
  // transparent top area of NewsIntroVertical's bottomImage overlay.
  // In backgroundMode the slider is visible underneath the static post-intro overlay;
  // in noBackground mode it fills the full screen after the intro.
  const sliderStartFrame = introDurationInFrames;

  // The static overlay image shown after the intro in backgroundMode.
  // introProps.image2 is the primary source (e.g. bottom2.png for vertical,
  // right.png for horizontal); falls back to the template default.
  const postIntroOverlayImage = isHorizontal
    ? (introProps.image2 || FALLBACK_OVERLAY_HORIZONTAL)
    : (introProps.image2 || FALLBACK_OVERLAY_VERTICAL);

  // Frames remaining for the post-intro overlay (only used in backgroundMode).
  const postIntroDurationInFrames = totalDuration - introDurationInFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>

      {/* ── LAYER 1: Slideshow images (bottom) ────────────────────────────── */}
      <AbsoluteFill style={{ zIndex: 1 }}>
        <LoopingImageSlider
          images={images}
          startFrame={sliderStartFrame}
          totalDurationInFrames={totalDuration}
          slideDurationInFrames={imageDurationInFrames}
          isBackgroundMode={backgroundMode}
        />
      </AbsoluteFill>

      {/* ── LAYER 2a: Animated intro (all variants) ───────────────────────── */}
      {/* Plays for the first introDurationInFrames frames on top of everything */}
      <Sequence durationInFrames={introDurationInFrames} layout="none">
        <AbsoluteFill style={{ zIndex: 10 }}>
          {isHorizontal ? (
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
        </AbsoluteFill>
      </Sequence>

      {/* ── LAYER 2b: Static overlay after intro (backgroundMode only) ────── */}
      {/* Takes over from the animated intro and stays until the end */}
      {backgroundMode && postIntroDurationInFrames > 0 && (
        <Sequence
          from={introDurationInFrames}
          durationInFrames={postIntroDurationInFrames}
          layout="none"
        >
          <AbsoluteFill style={{ zIndex: 10 }}>
            <Img
              src={staticFile(postIntroOverlayImage)}
              style={{ width: '100%', height: '100%', objectFit: 'fill' }}
            />
          </AbsoluteFill>
        </Sequence>
      )}

      {/* ── LAYER 3: Section chapter markers (optional) ───────────────────── */}
      {sections.length > 0 && (
        <AbsoluteFill style={{ zIndex: 50, pointerEvents: 'none' }}>
          <SectionSlider sections={sections} orientation={orientation} />
        </AbsoluteFill>
      )}

      {/* ── AUDIO: starts at frame 0, drives total video duration ─────────── */}
      {audioSrc && <Html5Audio src={audioSrc} />}

      {/* ── CAPTIONS: hidden during intro, visible from introDurationInFrames ─ */}
      {captions && captions.length > 0 && (
        <AbsoluteFill style={{ zIndex: 100 }}>
          <CaptionDisplay
            captions={captions as Caption[]}
            introDurationInFrames={introDurationInFrames}
          />
        </AbsoluteFill>
      )}

    </AbsoluteFill>
  );
};
