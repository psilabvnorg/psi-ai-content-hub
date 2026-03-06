// NewsVideo — schema, types, and shared layer structure for all 4 news compositions.
//
// Layer stack (bottom → top):
//   zIndex  1   LAYER 1 : LoopingImageSlider   — starts at introDurationInFrames
//   zIndex 10   LAYER 2a: Animated intro        — [0 … introDurationInFrames)
//   zIndex 10   LAYER 2b: Post-intro overlay    — [introDurationInFrames … end)  (optional slot)
//   zIndex 50   LAYER 3 : SectionSlider         — optional chapter markers
//               AUDIO   : plays from frame 0
//   zIndex 100  CAPTIONS: appear after intro ends

import React from 'react';
import { z } from 'zod';
import { AbsoluteFill, Html5Audio, Sequence, useVideoConfig } from 'remotion';
import { LoopingImageSlider } from './LoopingImageSlider';
import { CaptionDisplay } from './CaptionDisplay';
import { SectionSlider } from './SectionSlider';
import type { Caption } from '@remotion/captions';

// ─── Schema ──────────────────────────────────────────────────────────────────

export const newsVideoSchema = z.object({
  // Intro template images (loaded from intro-config-{orientation}-{bg|nobg}.json)
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
  // Locked per-composition — not exposed in user-facing schemas.
  backgroundMode: z.boolean().default(false),
  // overlayImage: logo shown after intro in noBackground mode (video-config overlayImage)
  overlayImage: z.string().optional(),
  // backgroundOverlayImage: static overlay after intro in backgroundMode (video-config backgroundOverlayImage)
  backgroundOverlayImage: z.string().optional(),
  introDurationInFrames: z.number(),
  imageDurationInFrames: z.number(),
  sections: z.array(z.object({ title: z.string(), startMs: z.number() })).default([]),
});

export type NewsVideoProps = z.infer<typeof newsVideoSchema>;

// ─── Base component ───────────────────────────────────────────────────────────

type Section = { title: string; startMs: number };

export type NewsVideoBaseProps = {
  images: string[];
  introDurationInFrames: number;
  imageDurationInFrames: number;
  audioSrc?: string;
  captions?: unknown[];
  sections?: Section[];
  orientation: 'vertical' | 'horizontal';
  isBackgroundMode: boolean;
  /** The animated intro component (NewsIntroVertical or NewsIntroHorizontal) */
  intro: React.ReactNode;
  /** Optional post-intro overlay rendered after introDurationInFrames until end */
  postIntroOverlay?: React.ReactNode;
};

export const NewsVideoBase: React.FC<NewsVideoBaseProps> = ({
  images,
  introDurationInFrames,
  imageDurationInFrames,
  audioSrc,
  captions,
  sections = [],
  orientation,
  isBackgroundMode,
  intro,
  postIntroOverlay,
}) => {
  const { durationInFrames: totalDuration } = useVideoConfig();
  const postIntroDurationInFrames = totalDuration - introDurationInFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>

      {/* ── LAYER 1: Slideshow images (bottom) ────────────────────────────── */}
      <AbsoluteFill style={{ zIndex: 1 }}>
        <LoopingImageSlider
          images={images}
          startFrame={introDurationInFrames}
          totalDurationInFrames={totalDuration}
          slideDurationInFrames={imageDurationInFrames}
          isBackgroundMode={isBackgroundMode}
        />
      </AbsoluteFill>

      {/* ── LAYER 2a: Animated intro ──────────────────────────────────────── */}
      <Sequence durationInFrames={introDurationInFrames} layout="none">
        <AbsoluteFill style={{ zIndex: 10 }}>
          {intro}
        </AbsoluteFill>
      </Sequence>

      {/* ── LAYER 2b: Post-intro overlay slot ─────────────────────────────── */}
      {postIntroOverlay && postIntroDurationInFrames > 0 && (
        <Sequence
          from={introDurationInFrames}
          durationInFrames={postIntroDurationInFrames}
          layout="none"
        >
          <AbsoluteFill style={{ zIndex: 10 }}>
            {postIntroOverlay}
          </AbsoluteFill>
        </Sequence>
      )}

      {/* ── LAYER 3: Section chapter markers (optional) ───────────────────── */}
      {sections.length > 0 && (
        <AbsoluteFill style={{ zIndex: 50, pointerEvents: 'none' }}>
          <SectionSlider sections={sections} orientation={orientation} />
        </AbsoluteFill>
      )}

      {/* ── AUDIO: starts at frame 0 ──────────────────────────────────────── */}
      {audioSrc && <Html5Audio src={audioSrc} />}

      {/* ── CAPTIONS: visible from introDurationInFrames ──────────────────── */}
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
