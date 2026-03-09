import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { ImageSlide } from './KenBurnsEffect';
import { resolveAsset } from '../utils/resolveAsset';

export const newsIntroVerticalSchema = z.object({
  topImage: z.string().default('templates/news-intro-vertical/top.png'),
  bottomImage: z.string().default('templates/news-intro-vertical/bottom.png'),
  heroImage: z.string().default('templates/news-intro-vertical/hero.png'),
});

export type NewsIntroVerticalProps = z.infer<typeof newsIntroVerticalSchema>;

export const NewsIntroVertical: React.FC<NewsIntroVerticalProps> = ({ topImage, bottomImage, heroImage }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  // Hero size = 1/4 of the top half area (interpreted as 1/4 of top-half height)
  const heroSize = height / 4;

  // 1 second static display before effects begin
  const delayFrames = fps;
  const isDelaying = frame < delayFrames;
  const effectFrame = Math.max(0, frame - delayFrames);

  // Spring: overshoots past 1 → "make bigger then make smaller (settle)"
  const heroScale = isDelaying
    ? 1
    : spring({
        frame: effectFrame,
        fps,
        config: { mass: 1, damping: 8, stiffness: 180 },
      });

  // Pendulum: slow left-right sine wave, starts at 0 naturally (sin(0)=0)
  const pendulumX = isDelaying ? 0 : Math.sin((effectFrame / fps) * Math.PI * 0.5) * 30;

  // Slow grow: gradually scale up throughout the clip (after delay)
  const slowGrow = isDelaying
    ? 1
    : interpolate(effectFrame, [0, durationInFrames - delayFrames], [1, 1.25], {
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
        <ImageSlide src={resolveAsset(topImage)} durationInFrames={durationInFrames} />
      </div>

      {/* BOTTOM OVERLAY: full-screen PNG, transparent top half reveals top image */}
      <AbsoluteFill>
        <Img
          src={resolveAsset(bottomImage)}
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
          src={resolveAsset(heroImage)}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
    </AbsoluteFill>
  );
};
