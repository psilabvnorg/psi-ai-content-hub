import { Sequence } from 'remotion';
import { ImageSlide } from './KenBurnsEffect';

interface LoopingImageSliderProps {
  images: string[];
  startFrame: number;
  totalDurationInFrames: number;
  slideDurationInFrames: number;
  isBackgroundMode?: boolean;
}

export const LoopingImageSlider: React.FC<LoopingImageSliderProps> = ({
  images,
  startFrame,
  totalDurationInFrames,
  slideDurationInFrames,
  isBackgroundMode = false,
}) => {
  if (images.length === 0 || slideDurationInFrames <= 0) {
    return null;
  }

  const mediaFrames = totalDurationInFrames - startFrame;
  if (mediaFrames <= 0) {
    return null;
  }

  const slideCount = Math.ceil(mediaFrames / slideDurationInFrames);

  return (
    <>
      {Array.from({ length: slideCount }).map((_, index) => {
        const elapsedFrames = index * slideDurationInFrames;
        const remainingFrames = mediaFrames - elapsedFrames;
        const durationInFrames = Math.min(slideDurationInFrames, remainingFrames);

        if (durationInFrames <= 0) {
          return null;
        }

        return (
          <Sequence
            key={`loop-image-${index}`}
            from={startFrame + elapsedFrames}
            durationInFrames={durationInFrames}
          >
            <ImageSlide
              src={images[index % images.length]}
              durationInFrames={durationInFrames}
              isBackgroundMode={isBackgroundMode}
            />
          </Sequence>
        );
      })}
    </>
  );
};
