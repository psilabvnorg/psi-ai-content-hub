import {
  useWindowedAudioData,
  visualizeAudio,
  visualizeAudioWaveform,
  createSmoothSvgPath,
} from '@remotion/media-utils';
import type { AudioData } from '@remotion/media-utils';
import { useVideoConfig } from 'remotion';

interface SoundWaveProps {
  audioData: AudioData | null;
  frame: number;
  dataOffsetInSeconds: number;
  waveformStyle: 'bars' | 'wave';
  accentColor: string;
  orientation: 'vertical' | 'horizontal';
  numberOfBars?: number;
}

export const SoundWave: React.FC<SoundWaveProps> = ({
  audioData,
  frame,
  dataOffsetInSeconds,
  waveformStyle,
  accentColor,
  orientation,
  numberOfBars = 64,
}) => {
  const { fps, width } = useVideoConfig();
  const waveHeight = orientation === 'vertical' ? 160 : 100;

  if (!audioData) {
    return null;
  }

  if (waveformStyle === 'wave') {
    const waveform = visualizeAudioWaveform({
      fps,
      frame,
      audioData,
      numberOfSamples: 256,
      windowInSeconds: 0.5,
      dataOffsetInSeconds,
    });

    const path = createSmoothSvgPath({
      points: waveform.map((y, i) => ({
        x: (i / (waveform.length - 1)) * width,
        y: waveHeight / 2 + (y * waveHeight) / 2,
      })),
    });

    return (
      <div
        style={{
          width: '100%',
          height: waveHeight,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <svg width={width} height={waveHeight} style={{ display: 'block' }}>
          {/* Glow effect */}
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Shadow path */}
          <path d={path} fill="none" stroke={accentColor} strokeWidth={4} strokeOpacity={0.3} filter="url(#glow)" />
          {/* Main path */}
          <path d={path} fill="none" stroke={accentColor} strokeWidth={2.5} strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  // Bars mode — mirror symmetric from center
  const numSamples = Math.pow(2, Math.ceil(Math.log2(Math.max(32, numberOfBars)))) as 32 | 64 | 128 | 256 | 512 | 1024;
  const frequencies = visualizeAudio({
    fps,
    frame,
    audioData,
    numberOfSamples: numSamples,
    optimizeFor: 'speed',
    dataOffsetInSeconds,
  });

  // Use first half of spectrum (bass to mid), mirrored
  const halfBars = Math.floor(numberOfBars / 2);
  const freqSlice = frequencies.slice(0, halfBars);

  // Mirror: left side reversed + right side
  const mirroredBars = [...[...freqSlice].reverse(), ...freqSlice];

  return (
    <div
      style={{
        width: '100%',
        height: waveHeight,
        display: 'flex',
        alignItems: 'flex-end',
        gap: '2px',
        paddingLeft: '8px',
        paddingRight: '8px',
        boxSizing: 'border-box',
      }}
    >
      {mirroredBars.map((v, i) => {
        // Logarithmic scaling for better visual balance
        const db = 20 * Math.log10(Math.max(v, 0.001));
        const minDb = -60;
        const maxDb = -10;
        const normalized = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
        const barHeight = Math.max(4, normalized * (waveHeight - 8));

        // Gradient: brighter at center, dimmer at edges
        const distFromCenter = Math.abs(i - (mirroredBars.length - 1) / 2) / (mirroredBars.length / 2);
        const alpha = 0.5 + 0.5 * (1 - distFromCenter);

        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: barHeight,
              backgroundColor: accentColor,
              opacity: alpha,
              borderRadius: '2px 2px 0 0',
              boxShadow: `0 0 6px ${accentColor}`,
              transition: 'height 0ms',
            }}
          />
        );
      })}
    </div>
  );
};

// Re-export the hook for use in parent components
export { useWindowedAudioData };
