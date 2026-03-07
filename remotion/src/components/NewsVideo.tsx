// NewsVideo — shared layer structure for news anchor compositions.
//
// Layer stack (bottom → top):
//   zIndex  1   LAYER 1 : LoopingImageSlider   — starts at introDurationInFrames
//   zIndex 10   LAYER 2a: Animated intro        — [0 … introDurationInFrames)
//   zIndex 10   LAYER 2b: Post-intro overlay    — [introDurationInFrames … end)  (optional slot)
//   zIndex 50   LAYER 3 : SectionSlider         — optional chapter markers
//               AUDIO   : plays from frame 0
//   zIndex 100  CAPTIONS: appear after intro ends

import React from 'react';
import { AbsoluteFill, Html5Audio, Sequence, useVideoConfig } from 'remotion';
import { LoopingImageSlider } from './LoopingImageSlider';
import { CaptionDisplay } from './CaptionDisplay';
import { SectionSlider } from './SectionSlider';
import type { Caption } from '@remotion/captions';

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
  /** Use horizontal background layout for the image slider (left 65% width) */
  isHorizontalBackground?: boolean;
  /** Vertical position of captions from bottom (default 20) */
  captionBottomPercent?: number;
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
  isHorizontalBackground = false,
  captionBottomPercent = 20,
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
          isHorizontalBackground={isHorizontalBackground}
        />
      </AbsoluteFill>

      {/* ── LAYER 2a: Animated intro ──────────────────────────────────────── */}
      {introDurationInFrames > 0 && (
        <Sequence durationInFrames={introDurationInFrames} layout="none">
          <AbsoluteFill style={{ zIndex: 10 }}>
            {intro}
          </AbsoluteFill>
        </Sequence>
      )}

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
            captionBottomPercent={captionBottomPercent}
          />
        </AbsoluteFill>
      )}

    </AbsoluteFill>
  );
};
