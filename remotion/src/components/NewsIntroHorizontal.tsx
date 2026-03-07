import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { ImageSlide } from './KenBurnsEffect';

const resolveAssetSrc = (src: string): string => {
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/")) {
    return src;
  }
  return staticFile(src);
};

type NewsIntroHorizontalProps = {
  leftImage: string;
  rightImage: string;
  heroImage: string;
  showHeroImage?: boolean;
};

export const NewsIntroHorizontal: React.FC<NewsIntroHorizontalProps> = ({ leftImage, rightImage, heroImage, showHeroImage = true }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  const heroSize = (height / 4) * 1.8;

  // Spring: overshoots → "make bigger then make smaller (settle)"
  const heroScale = spring({
    frame,
    fps,
    config: { mass: 1, damping: 8, stiffness: 180 },
  });

  // Pendulum: slow left-right sine wave
  const pendulumX = Math.sin((frame / fps) * Math.PI * 0.5) * 30;

  // Slow grow throughout the clip
  const slowGrow = interpolate(frame, [0, durationInFrames], [1, 1.25], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* LEFT HALF: left.png with Ken Burns effect (lowest layer) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '65%',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        <ImageSlide src={resolveAssetSrc(leftImage)} durationInFrames={durationInFrames} />
      </div>

      {/* RIGHT OVERLAY: full-screen PNG, transparent left portion reveals left image */}
      <AbsoluteFill>
        <Img
          src={resolveAssetSrc(rightImage)}
          style={{ width: '100%', height: '100%', objectFit: 'fill' }}
        />
      </AbsoluteFill>

      {/* HERO IMAGE: right edge of left half, vertically centered, with effects */}
      {showHeroImage && (
        <div
          style={{
            position: 'absolute',
            top: (height - heroSize) / 2,
            left: width / 2 - heroSize,
            width: heroSize,
            height: heroSize,
            transform: `translateX(${pendulumX}px) scale(${heroScale * slowGrow})`,
            transformOrigin: 'right center',
          }}
        >
          <Img
            src={resolveAssetSrc(heroImage)}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};
