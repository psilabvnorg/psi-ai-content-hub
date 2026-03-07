// NewsHorizontalBackground
//
// Orientation : HORIZONTAL — 1920 × 1080 (landscape / YouTube)
// Background mode : ON
//   • Frames [0 … introDurationInFrames)  → animated NewsIntroHorizontal plays on top
//   • Frames [introDurationInFrames … end) → backgroundOverlayImage covers screen;
//     slideshow images remain visible underneath as background
//   • Audio plays from frame 0
//   • Subtitles appear only after the intro ends (introDurationInFrames)
//   • Hero image (main/news/image/hero.png) overlays entire clip on the left half,
//     with a breathing scale effect (bigger → smaller loop)

import React from 'react';
import { z } from 'zod';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CalculateMetadataFunction } from 'remotion';
import { newsVideoSchema, type NewsVideoProps, NewsVideoBase } from '../components/NewsVideo';
import { NewsIntroHorizontal } from '../components/NewsIntroHorizontal';
import { calculateNewsVideoMetadata } from '../components/calculateNewsVideoMetadata';

export const schema = newsVideoSchema.omit({ orientation: true, backgroundMode: true });
export type Props = z.infer<typeof schema>;

export const calculateMetadata: CalculateMetadataFunction<Props> = async (opts) => {
  const fullProps: NewsVideoProps = { ...opts.props, orientation: 'horizontal', backgroundMode: true };
  const fullDefaultProps: NewsVideoProps = { ...opts.defaultProps, orientation: 'horizontal', backgroundMode: true };
  return calculateNewsVideoMetadata({ ...opts, props: fullProps, defaultProps: fullDefaultProps });
};

const fill: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'fill' };

// Breathing hero overlay — covers entire clip duration, left half of screen, top layer
const HeroPersistentOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const heroSize = (height / 4) * 2.7;

  // Slow breathing: bigger → smaller, period = 3 seconds
  const breathCycle = (frame / fps) * (Math.PI * 2) / 3;
  const breathScale = 1 + 0.05 * Math.sin(breathCycle);

  // Center horizontally within the right 50%, vertically centered
  const heroLeft = width * 0.75 - heroSize / 2;
  const heroTop = (height - heroSize) / 2 - height * 0.1;

  return (
    <div
      style={{
        position: 'absolute',
        top: heroTop,
        left: heroLeft,
        width: heroSize,
        height: heroSize,
        transform: `scale(${breathScale})`,
        transformOrigin: 'center center',
      }}
    >
      <Img
        src={staticFile('main/news/image/hero.png')}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </div>
  );
};

export const NewsHorizontalBackground: React.FC<Props> = ({
  introProps,
  images,
  audioSrc,
  captions,
  backgroundOverlayImage,
  introDurationInFrames,
  imageDurationInFrames,
  sections = [],
}) => (
  <AbsoluteFill>
    <NewsVideoBase
      images={images}
      introDurationInFrames={introDurationInFrames}
      imageDurationInFrames={imageDurationInFrames}
      audioSrc={audioSrc}
      captions={captions}
      sections={sections}
      orientation="horizontal"
      isBackgroundMode={true}
      isHorizontalBackground={true}
      intro={
        <NewsIntroHorizontal
          leftImage={introProps.image1}
          rightImage={introProps.image2}
          heroImage={introProps.heroImage}
          showHeroImage={false}
        />
      }
      postIntroOverlay={
        backgroundOverlayImage
          ? <Img src={staticFile(backgroundOverlayImage)} style={fill} />
          : undefined
      }
    />

    {/* Persistent hero overlay — top layer, entire clip duration */}
    <AbsoluteFill style={{ zIndex: 200, pointerEvents: 'none' }}>
      <HeroPersistentOverlay />
    </AbsoluteFill>
  </AbsoluteFill>
);
