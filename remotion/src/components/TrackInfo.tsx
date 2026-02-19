import { visualizeAudio } from '@remotion/media-utils';
import type { AudioData } from '@remotion/media-utils';
import { useVideoConfig } from 'remotion';

interface TrackInfoProps {
  audioData: AudioData | null;
  frame: number;
  dataOffsetInSeconds: number;
  trackTitle: string;
  artistName: string;
  accentColor: string;
  orientation: 'vertical' | 'horizontal';
  textBackgroundColor: string;
  textBackgroundOpacity: number;
}

/** Convert a hex color + opacity into an rgba() string. */
const hexToRgba = (hex: string, opacity: number): string => {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

/**
 * Derive a human-readable title from an audio file path.
 * e.g. "main/music-playlist/audio/my-track.mp3" → "My Track"
 */
export const deriveTitleFromPath = (audioSrc: string): string => {
  const filename = audioSrc.split('/').pop() ?? audioSrc;
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  return withoutExt
    .replace(/[-_.]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
};

export const TrackInfo: React.FC<TrackInfoProps> = ({
  audioData,
  frame,
  dataOffsetInSeconds,
  trackTitle,
  artistName,
  accentColor,
  orientation,
  textBackgroundColor,
  textBackgroundOpacity,
}) => {
  const { fps } = useVideoConfig();

  // Bass-reactive scale — default 1 when audio not loaded
  let titleScale = 1;
  let bassGlow = 0;

  if (audioData) {
    const frequencies = visualizeAudio({
      fps,
      frame,
      audioData,
      numberOfSamples: 128,
      optimizeFor: 'speed',
      dataOffsetInSeconds,
    });
    const bassIntensity =
      frequencies.slice(0, 32).reduce((sum, v) => sum + v, 0) / 32;
    titleScale = 1 + bassIntensity * 0.15;
    bassGlow = bassIntensity;
  }

  const glowStrength = Math.round(bassGlow * 20);
  const titleGlow = glowStrength > 2 ? `0 0 ${glowStrength}px ${accentColor}` : 'none';

  const bgColor = hexToRgba(textBackgroundColor, textBackgroundOpacity);

  if (orientation === 'horizontal') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          height: '100%',
          paddingLeft: 60,
          paddingRight: 60,
          gap: 24,
        }}
      >
        {/* Background pill wrapping title + artist */}
        <div
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 16,
            backgroundColor: bgColor,
            borderRadius: 20,
            padding: '28px 40px',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 900,
              color: accentColor,
              lineHeight: 1.1,
              transform: `scale(${titleScale})`,
              transformOrigin: 'left center',
              textShadow: titleGlow,
              fontFamily: 'Montserrat, sans-serif',
              letterSpacing: '-1px',
              maxWidth: 700,
            }}
          >
            {trackTitle}
          </div>
          {artistName && (
            <div
              style={{
                fontSize: 42,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.9)',
                fontFamily: 'Montserrat, sans-serif',
                letterSpacing: '3px',
                textTransform: 'uppercase',
              }}
            >
              {artistName}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Vertical layout
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        padding: '0 60px',
        boxSizing: 'border-box',
      }}
    >
      {/* Background pill wrapping title + artist */}
      <div
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          backgroundColor: bgColor,
          borderRadius: 20,
          padding: '28px 48px',
          backdropFilter: 'blur(8px)',
          maxWidth: 900,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 900,
            color: accentColor,
            lineHeight: 1.15,
            textAlign: 'center',
            transform: `scale(${titleScale})`,
            transformOrigin: 'center center',
            textShadow: titleGlow,
            fontFamily: 'Montserrat, sans-serif',
            letterSpacing: '-0.5px',
          }}
        >
          {trackTitle}
        </div>
        {artistName && (
          <div
            style={{
              fontSize: 36,
              fontWeight: 500,
              color: 'rgba(255,255,255,0.9)',
              textAlign: 'center',
              fontFamily: 'Montserrat, sans-serif',
              letterSpacing: '3px',
              textTransform: 'uppercase',
            }}
          >
            {artistName}
          </div>
        )}
      </div>
    </div>
  );
};
