// NewsHorizontalBackgroundCNN
//
// Orientation : HORIZONTAL — 1920 × 1080 (landscape / YouTube)
// Background mode : OFF (like NewsHorizontalNoBackground)
//   • No intro — slideshow images fill the screen from frame 0
//   • Subtitles appear immediately from frame 0
//   • captionBottomPercent is configurable (default 0 = lower than standard 20%)
//   • overlayImage (logo) is shown on top if configured

import React from 'react';
import { z } from 'zod';
import { Img, staticFile } from 'remotion';
import type { CalculateMetadataFunction } from 'remotion';
import { newsVideoSchema, type NewsVideoProps, NewsVideoBase } from '../components/NewsVideo';
import { calculateNewsVideoMetadata } from '../components/calculateNewsVideoMetadata';

export const schema = newsVideoSchema.omit({ orientation: true, backgroundMode: true });
export type Props = z.infer<typeof schema>;

export const calculateMetadata: CalculateMetadataFunction<Props> = async (opts) => {
  const fullProps: NewsVideoProps = { ...opts.props, orientation: 'horizontal', backgroundMode: false, videoConfigFilename: 'video-config-horizontal-cnn.json' };
  const fullDefaultProps: NewsVideoProps = { ...opts.defaultProps, orientation: 'horizontal', backgroundMode: false, videoConfigFilename: 'video-config-horizontal-cnn.json' };
  return calculateNewsVideoMetadata({ ...opts, props: fullProps, defaultProps: fullDefaultProps });
};

const fill: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'fill' };

export const NewsHorizontalBackgroundCNN: React.FC<Props> = ({
  images,
  audioSrc,
  captions,
  overlayImage,
  introDurationInFrames,
  imageDurationInFrames,
  captionBottomPercent,
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
    captionBottomPercent={captionBottomPercent}
    intro={<></>}
    postIntroOverlay={
      overlayImage
        ? <Img src={staticFile(overlayImage)} style={fill} />
        : undefined
    }
  />
);
