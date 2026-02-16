import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';

interface ImageSlideProps {
  src: string;
  durationInFrames: number;
  isBackgroundMode?: boolean; // When true, render in top half only
}

export const ImageSlide: React.FC<ImageSlideProps> = ({ src, durationInFrames, isBackgroundMode = false }) => {
  const frame = useCurrentFrame();

  // Linear pan animation - constant speed from left to right
  const panX = interpolate(
    frame,
    [0, durationInFrames],
    [-23, 0.5],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  // Background mode: render in top half only
  if (isBackgroundMode) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '50%',
            overflow: 'hidden',
          }}
        >
          {/* Blurred background */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              overflow: 'hidden',
            }}
          >
            <Img
              src={src}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'blur(20px)',
                transform: 'scale(1.1)',
              }}
            />
          </div>

          {/* Foreground with pan */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '150%',
              height: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              overflow: 'hidden',
            }}
          >
            <Img
              src={src}
              style={{
                width: '130%',
                height: 'auto',
                objectFit: 'contain',
                transform: `translateX(${panX}%)`,
                transformOrigin: 'center center',
              }}
            />
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Normal mode: full screen
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Blurred background layer */}
      <AbsoluteFill>
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden',
          }}
        >
          <Img
            src={src}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'blur(20px)',
              transform: 'scale(1.1)',
            }}
          />
        </div>
      </AbsoluteFill>

      {/* Foreground layer with pan effect */}
      <AbsoluteFill>
        <div
          style={{
            width: '150%',
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden',
          }}
        >
          <Img
            src={src}
            style={{
              width: '130%',
              height: 'auto',
              objectFit: 'contain',
              transform: `translateX(${panX}%)`,
              transformOrigin: 'center center',
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
