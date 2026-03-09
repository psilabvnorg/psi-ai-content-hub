import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { ImageSlide } from './KenBurnsEffect';
import { resolveAsset } from '../utils/resolveAsset';

export const newsIntroHorizontalSchema = z.object({
  leftImage: z.string().default('templates/news-intro-horizontal/left.png'),
  rightImage: z.string().default('templates/news-intro-horizontal/right.png'),
  heroImage: z.string().default('templates/news-intro-horizontal/hero.png'),
});

export type NewsIntroHorizontalProps = z.infer<typeof newsIntroHorizontalSchema> & {
  showHeroImage?: boolean;
};

export const NewsIntroHorizontal: React.FC<NewsIntroHorizontalProps> = ({ leftImage, rightImage, heroImage, showHeroImage = true }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  const heroSize = (height / 4) * 1.8;

  // 1 second static display before effects begin
  const delayFrames = fps;
  const isDelaying = frame < delayFrames;
  const effectFrame = Math.max(0, frame - delayFrames);

  // Spring: overshoots → "make bigger then make smaller (settle)"
  const heroScale = isDelaying
    ? 1
    : spring({
        frame: effectFrame,
        fps,
        config: { mass: 1, damping: 8, stiffness: 180 },
      });

  // Pendulum: slow left-right sine wave
  const pendulumX = isDelaying ? 0 : Math.sin((effectFrame / fps) * Math.PI * 0.5) * 30;

  // Slow grow throughout the clip (after delay)
  const slowGrow = isDelaying
    ? 1
    : interpolate(effectFrame, [0, durationInFrames - delayFrames], [1, 1.25], {
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
        <ImageSlide src={staticFile(leftImage)} durationInFrames={durationInFrames} />
      </div>

      {/* RIGHT OVERLAY: full-screen PNG, transparent left portion reveals left image */}
      <AbsoluteFill>
        <Img
          src={staticFile(rightImage)}
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
            src={resolveAsset(heroImage)}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};
