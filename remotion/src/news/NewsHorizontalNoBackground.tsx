// NewsHorizontalNoBackground
//
// Orientation : HORIZONTAL — 1920 × 1080 (landscape / YouTube)
// Background mode : OFF
//   • Frames [0 … introDurationInFrames)  → animated NewsIntroHorizontal plays (full screen)
//   • Frames [introDurationInFrames … end) → slideshow images only (no overlay)
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
  const fullProps: NewsVideoProps = { ...opts.props, orientation: 'horizontal', backgroundMode: false };
  const fullDefaultProps: NewsVideoProps = { ...opts.defaultProps, orientation: 'horizontal', backgroundMode: false };
  return calculateNewsVideoMetadata({ ...opts, props: fullProps, defaultProps: fullDefaultProps });
};

export const NewsHorizontalNoBackground: React.FC<Props> = (props) => (
  <NewsVideo {...props} orientation="horizontal" backgroundMode={false} />
);
