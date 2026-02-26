import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';

interface ImageSlideProps {
  src: string;
  durationInFrames: number;
  isBackgroundMode?: boolean;
}

export const ImageSlide: React.FC<ImageSlideProps> = ({
  src,
  durationInFrames,
  isBackgroundMode = false,
}) => {
  const frame = useCurrentFrame();

  // Random direction based on image hash
  const seed = src.length;
  const direction = seed % 2 === 0 ? 'horizontal' : 'vertical';

  // Slight zoom (internal)
  const zoom = interpolate(frame, [0, durationInFrames], [1.0, 1.05], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Slight movement inside image
  const panAmount = 3; // % small
  const panX =
    direction === 'horizontal'
      ? interpolate(frame, [0, durationInFrames], [-panAmount, panAmount])
      : 0;
  const panY =
    direction === 'vertical'
      ? interpolate(frame, [0, durationInFrames], [-panAmount, panAmount])
      : 0;

  // Apply transform to IMAGE, not wrapper
  const imageTransform = `
    translate(${panX}%, ${panY}%)
    scale(${zoom})
  `;

  //
  // BACKGROUND MODE
  //
  if (isBackgroundMode) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        {/* Blur background (static) */}
        <AbsoluteFill
          style={{
            width: '100%',
            height: '50%',
            top: 0,
            overflow: 'hidden',
            position: 'absolute',
          }}
        >
          <Img
            src={src}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'blur(25px)',
              transform: 'scale(1.1)', // static
            }}
          />
        </AbsoluteFill>

        {/* Foreground Ken Burns */}
        <AbsoluteFill
          style={{
            width: '100%',
            height: '50%',
            top: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden',
            position: 'absolute',
          }}
        >
          <Img
            src={src}
            style={{
              width: 'auto',
              height: '100%',
              objectFit: 'contain',
              transform: imageTransform,
              transformOrigin: 'center center',
            }}
          />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  //
  // FULLSCREEN MODE
  //
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Blur background (static) */}
      <AbsoluteFill
        style={{
          overflow: 'hidden',
          filter: 'blur(25px)',
        }}
      >
        <Img
          src={src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'scale(1.1)', // static
          }}
        />
      </AbsoluteFill>

      {/* Foreground image with internal Ken Burns */}
      <AbsoluteFill
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        <Img
          src={src}
          style={{
            width: 'auto',
            height: '100%',
            objectFit: 'contain',
            transform: imageTransform,
            transformOrigin: 'center center',
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};