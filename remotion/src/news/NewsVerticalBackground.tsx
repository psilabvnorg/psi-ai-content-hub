// NewsVerticalBackground
//
// Orientation : VERTICAL  — 1080 × 1920 (portrait / TikTok / Reels)
// Background mode : ON
//   • Frames [0 … introDurationInFrames)  → animated NewsIntroVertical plays on top
//   • Frames [introDurationInFrames … end) → backgroundOverlayImage covers screen;
//     slideshow images remain visible underneath as background
//   • Audio plays from frame 0
//   • Subtitles appear only after the intro ends (introDurationInFrames)

import React from 'react';
import { z } from 'zod';
import { Img } from 'remotion';
import { resolveAsset } from '../utils/resolveAsset';
import type { CalculateMetadataFunction } from 'remotion';
import { newsVideoSchema, type NewsVideoProps, NewsVideoBase } from '../components/NewsVideo';
import { NewsIntroVertical } from '../components/NewsIntroVertical';
import { calculateNewsVideoMetadata } from '../components/calculateNewsVideoMetadata';

export const schema = newsVideoSchema.omit({ orientation: true, backgroundMode: true });
export type Props = z.infer<typeof schema>;

export const calculateMetadata: CalculateMetadataFunction<Props> = async (opts) => {
  const fullProps: NewsVideoProps = { ...opts.props, orientation: 'vertical', backgroundMode: true };
  const fullDefaultProps: NewsVideoProps = { ...opts.defaultProps, orientation: 'vertical', backgroundMode: true };
  return calculateNewsVideoMetadata({ ...opts, props: fullProps, defaultProps: fullDefaultProps });
};

const fill: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'fill' };

export const NewsVerticalBackground: React.FC<Props> = ({
  introProps,
  images,
  audioSrc,
  captions,
  backgroundOverlayImage,
  introDurationInFrames,
  imageDurationInFrames,
  sections = [],
  backgroundMusic,
  backgroundMusicVolume,
}) => (
  <NewsVideoBase
    images={images}
    introDurationInFrames={introDurationInFrames}
    imageDurationInFrames={imageDurationInFrames}
    audioSrc={audioSrc}
    captions={captions}
    sections={sections}
    orientation="vertical"
    isBackgroundMode={true}
    backgroundMusic={backgroundMusic}
    backgroundMusicVolume={backgroundMusicVolume}
    intro={
      <NewsIntroVertical
        topImage={introProps.image1}
        bottomImage={introProps.image2}
        heroImage={introProps.heroImage}
      />
    }
    postIntroOverlay={
      backgroundOverlayImage
        ? <Img src={resolveAsset(backgroundOverlayImage)} style={fill} />
        : undefined
    }
  />
);
