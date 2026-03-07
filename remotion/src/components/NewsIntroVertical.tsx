import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { ImageSlide } from './KenBurnsEffect';

const resolveAssetSrc = (src: string): string => {
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/")) {
    return src;
  }
  return staticFile(src);
};

type NewsIntroVerticalProps = {
  topImage: string;
  bottomImage: string;
  heroImage: string;
};

export const NewsIntroVertical: React.FC<NewsIntroVerticalProps> = ({ topImage, bottomImage, heroImage }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  // Hero size = 1/4 of the top half area (interpreted as 1/4 of top-half height)
  const heroSize = height / 4;

  // Spring: overshoots past 1 → "make bigger then make smaller (settle)"
  const heroScale = spring({
    frame,
    fps,
    config: { mass: 1, damping: 8, stiffness: 180 },
  });

  // Pendulum: slow left-right sine wave, starts at 0 naturally (sin(0)=0)
  const pendulumX = Math.sin((frame / fps) * Math.PI * 0.5) * 30;

  // Slow grow: gradually scale up throughout the clip
  const slowGrow = interpolate(frame, [0, durationInFrames], [1, 1.25], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* TOP HALF: top.png with Ken Burns effect (lowest layer) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '65%',
          overflow: 'hidden',
        }}
      >
        <ImageSlide src={resolveAssetSrc(topImage)} durationInFrames={durationInFrames} />
      </div>

      {/* BOTTOM OVERLAY: full-screen PNG, transparent top half reveals top image */}
      <AbsoluteFill>
        <Img
          src={resolveAssetSrc(bottomImage)}
          style={{ width: '100%', height: '100%', objectFit: 'fill' }}
        />
      </AbsoluteFill>

      {/* HERO IMAGE: bottom of top half, centered, scale-bounce effect */}
      <div
        style={{
          position: 'absolute',
          top: height / 2 - heroSize,
          left: (width - heroSize) / 2,
          width: heroSize,
          height: heroSize,
          transform: `translateX(${pendulumX}px) scale(${heroScale * slowGrow})`,
          transformOrigin: 'center bottom',
        }}
      >
        <Img
          src={resolveAssetSrc(heroImage)}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
    </AbsoluteFill>
  );
};
