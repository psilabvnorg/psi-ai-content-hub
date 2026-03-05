// NewsVerticalBackground
//
// Orientation : VERTICAL  — 1080 × 1920 (portrait / TikTok / Reels)
// Background mode : ON
//   • Frames [0 … introDurationInFrames)  → animated NewsIntroVertical plays on top
//   • Frames [introDurationInFrames … end) → static overlay image covers screen;
//     slideshow images remain visible underneath as background
//   • Audio plays from frame 0
//   • Subtitles appear only after the intro ends (introDurationInFrames)

import React from 'react';
import { z } from 'zod';
import type { CalculateMetadataFunction } from 'remotion';
import { NewsVideo, newsVideoSchema } from '../components/NewsVideo';
import { calculateNewsVideoMetadata } from '../components/calculateNewsVideoMetadata';
import type { NewsVideoProps } from '../components/NewsVideo';

// orientation and backgroundMode are locked by this composition and hidden from the user-facing schema
export const schema = newsVideoSchema.omit({ orientation: true, backgroundMode: true });
export type Props = z.infer<typeof schema>;

export const calculateMetadata: CalculateMetadataFunction<Props> = async (opts) => {
  const fullProps: NewsVideoProps = { ...opts.props, orientation: 'vertical', backgroundMode: true };
  const fullDefaultProps: NewsVideoProps = { ...opts.defaultProps, orientation: 'vertical', backgroundMode: true };
  return calculateNewsVideoMetadata({ ...opts, props: fullProps, defaultProps: fullDefaultProps });
};

export const NewsVerticalBackground: React.FC<Props> = (props) => (
  <NewsVideo {...props} orientation="vertical" backgroundMode={true} />
);
