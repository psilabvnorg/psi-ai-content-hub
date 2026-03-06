// NewsHorizontalNoBackground
//
// Orientation : HORIZONTAL — 1920 × 1080 (landscape / YouTube)
// Background mode : OFF
//   • Frames [0 … introDurationInFrames)  → animated NewsIntroHorizontal plays (full screen)
//   • Frames [introDurationInFrames … end) → slideshow images fill the screen;
//     overlayImage (logo) is shown on top if configured
//   • Audio plays from frame 0
//   • Subtitles appear only after the intro ends (introDurationInFrames)

import React from 'react';
import { z } from 'zod';
import { Img, staticFile } from 'remotion';
import type { CalculateMetadataFunction } from 'remotion';
import { newsVideoSchema, type NewsVideoProps, NewsVideoBase } from '../components/NewsVideo';
import { NewsIntroHorizontal } from '../components/NewsIntroHorizontal';
import { calculateNewsVideoMetadata } from '../components/calculateNewsVideoMetadata';

export const schema = newsVideoSchema.omit({ orientation: true, backgroundMode: true });
export type Props = z.infer<typeof schema>;

export const calculateMetadata: CalculateMetadataFunction<Props> = async (opts) => {
  const fullProps: NewsVideoProps = { ...opts.props, orientation: 'horizontal', backgroundMode: false };
  const fullDefaultProps: NewsVideoProps = { ...opts.defaultProps, orientation: 'horizontal', backgroundMode: false };
  return calculateNewsVideoMetadata({ ...opts, props: fullProps, defaultProps: fullDefaultProps });
};

const fill: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'fill' };

export const NewsHorizontalNoBackground: React.FC<Props> = ({
  introProps,
  images,
  audioSrc,
  captions,
  overlayImage,
  introDurationInFrames,
  imageDurationInFrames,
  sections = [],
}) => (
  <NewsVideoBase
    images={images}
    introDurationInFrames={introDurationInFrames}
    imageDurationInFrames={imageDurationInFrames}
    audioSrc={audioSrc}
    captions={captions}
    sections={sections}
    orientation="horizontal"
    isBackgroundMode={false}
    intro={
      <NewsIntroHorizontal
        leftImage={introProps.image1}
        rightImage={introProps.image2}
        heroImage={introProps.heroImage}
      />
    }
    postIntroOverlay={
      overlayImage
        ? <Img src={staticFile(overlayImage)} style={fill} />
        : undefined
    }
  />
);
