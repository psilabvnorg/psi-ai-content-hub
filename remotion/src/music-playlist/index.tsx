import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { useWindowedAudioData, visualizeAudio } from '@remotion/media-utils';
import { LoopingImageSlider } from '../components/LoopingImageSlider';
import { SoundWave } from '../components/SoundWave';
import { TrackInfo, deriveTitleFromPath } from '../components/TrackInfo';
import { musicPlaylistSchema, type MusicPlaylistProps } from './calculateMainVideoMetadata';

export { musicPlaylistSchema };
export type { MusicPlaylistProps };

// ─── Cover Art ────────────────────────────────────────────────────────────────

interface CoverArtProps {
  images: string[];
  frame: number;
  imageDurationInFrames: number;
  bassIntensity: number;
  orientation: 'vertical' | 'horizontal';
  heroImage?: string;
}

const CoverArt: React.FC<CoverArtProps> = ({
  images,
  frame,
  imageDurationInFrames,
  bassIntensity,
  orientation,
  heroImage,
}) => {
  // heroImage takes priority; fall back to cycling through images
  const hasSrc = heroImage || images.length > 0;
  if (!hasSrc) return null;

  const imgIndex = Math.floor(frame / imageDurationInFrames) % images.length;
  const src = heroImage || images[imgIndex];

  // Pan animation within each slide
  const frameInSlide = frame % imageDurationInFrames;
  const panX = interpolate(frameInSlide, [0, imageDurationInFrames], [-8, 8], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Bass-reactive scale
  const coverScale = 1 + bassIntensity * 0.05;

  if (orientation === 'horizontal') {
    return (
      <div
        style={{
          width: 480,
          height: 480,
          borderRadius: 24,
          overflow: 'hidden',
          boxShadow: `0 0 60px rgba(0,0,0,0.8), 0 0 ${20 + bassIntensity * 30}px rgba(168,85,247,0.4)`,
          transform: `scale(${coverScale})`,
          flexShrink: 0,
        }}
      >
        <Img
          src={src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `translateX(${panX}px)`,
          }}
        />
      </div>
    );
  }

  // Vertical: centered square
  return (
    <div
      style={{
        width: 560,
        height: 560,
        borderRadius: 28,
        overflow: 'hidden',
        boxShadow: `0 0 80px rgba(0,0,0,0.8), 0 0 ${20 + bassIntensity * 40}px rgba(168,85,247,0.5)`,
        transform: `scale(${coverScale})`,
      }}
    >
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `translateX(${panX}px)`,
        }}
      />
    </div>
  );
};

// ─── Per-Track Sequence ────────────────────────────────────────────────────────

interface TrackSequenceProps {
  audioSrc: string;
  images: string[];
  imageDurationInFrames: number;
  artistName: string;
  accentColor: string;
  waveformStyle: 'bars' | 'wave';
  numberOfBars: number;
  orientation: 'vertical' | 'horizontal';
  title: string;
  heroImage: string;
  textBackgroundColor: string;
  textBackgroundOpacity: number;
}

const TrackSequence: React.FC<TrackSequenceProps> = ({
  audioSrc,
  images,
  imageDurationInFrames,
  artistName,
  accentColor,
  waveformStyle,
  numberOfBars,
  orientation,
  title,
  heroImage,
  textBackgroundColor,
  textBackgroundOpacity,
}) => {
  // frame is relative to this track's Sequence — correct for useWindowedAudioData
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const { audioData, dataOffsetInSeconds } = useWindowedAudioData({
    src: audioSrc,
    frame,
    fps,
    windowInSeconds: 30,
  });

  // Derive bass intensity for reactive effects
  let bassIntensity = 0;
  if (audioData) {
    const frequencies = visualizeAudio({
      fps,
      frame,
      audioData,
      numberOfSamples: 128,
      optimizeFor: 'speed',
      dataOffsetInSeconds,
    });
    bassIntensity = frequencies.slice(0, 32).reduce((sum, v) => sum + v, 0) / 32;
  }

  const trackTitle = title || deriveTitleFromPath(audioSrc);
  const waveHeight = orientation === 'vertical' ? 160 : 100;

  if (orientation === 'horizontal') {
    return (
      <AbsoluteFill>
        {/* Audio */}
        <Audio src={audioSrc} />

        {/* Main content: cover art (left) + track info (right) */}
        <AbsoluteFill
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 120,
            paddingRight: 80,
            paddingBottom: waveHeight + 40,
            gap: 80,
          }}
        >
          <CoverArt
            images={images}
            frame={frame}
            imageDurationInFrames={imageDurationInFrames}
            bassIntensity={bassIntensity}
            orientation="horizontal"
            heroImage={heroImage || undefined}
          />
          <div style={{ flex: 1, height: '100%' }}>
            <TrackInfo
              audioData={audioData}
              frame={frame}
              dataOffsetInSeconds={dataOffsetInSeconds}
              trackTitle={trackTitle}
              artistName={artistName}
              accentColor={accentColor}
              orientation="horizontal"
              textBackgroundColor={textBackgroundColor}
              textBackgroundOpacity={textBackgroundOpacity}
            />
          </div>
        </AbsoluteFill>

        {/* Sound wave at bottom */}
        <AbsoluteFill
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            paddingBottom: 0,
          }}
        >
          <SoundWave
            audioData={audioData}
            frame={frame}
            dataOffsetInSeconds={dataOffsetInSeconds}
            waveformStyle={waveformStyle}
            accentColor={accentColor}
            orientation="horizontal"
            numberOfBars={numberOfBars}
          />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // Vertical layout
  return (
    <AbsoluteFill>
      {/* Audio */}
      <Audio src={audioSrc} />

      {/* Cover art: top 55% area, centered */}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: 200,
        }}
      >
        <CoverArt
          images={images}
          frame={frame}
          imageDurationInFrames={imageDurationInFrames}
          bassIntensity={bassIntensity}
          orientation="vertical"
          heroImage={heroImage || undefined}
        />
      </AbsoluteFill>

      {/* Track info: lower 40%, above wave */}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          paddingBottom: waveHeight + 40,
          paddingLeft: 40,
          paddingRight: 40,
          gap: 0,
        }}
      >
        <TrackInfo
          audioData={audioData}
          frame={frame}
          dataOffsetInSeconds={dataOffsetInSeconds}
          trackTitle={trackTitle}
          artistName={artistName}
          accentColor={accentColor}
          orientation="vertical"
          textBackgroundColor={textBackgroundColor}
          textBackgroundOpacity={textBackgroundOpacity}
        />
      </AbsoluteFill>

      {/* Sound wave at very bottom */}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
        }}
      >
        <SoundWave
          audioData={audioData}
          frame={frame}
          dataOffsetInSeconds={dataOffsetInSeconds}
          waveformStyle={waveformStyle}
          accentColor={accentColor}
          orientation="vertical"
          numberOfBars={numberOfBars}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const MusicPlaylistVideo: React.FC<MusicPlaylistProps> = ({
  audioFiles,
  audioDurationsInFrames,
  images,
  imageDurationInFrames,
  artistName,
  accentColor,
  waveformStyle,
  numberOfBars,
  orientation,
  title,
  heroImage,
  textBackgroundColor,
  textBackgroundOpacity,
}) => {
  const { durationInFrames: totalDuration } = useVideoConfig();

  // Build cumulative start frames for each track
  const cumulativeStarts: number[] = [];
  let cumulative = 0;
  for (const dur of audioDurationsInFrames) {
    cumulativeStarts.push(cumulative);
    cumulative += dur;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* ── LAYER 1: Blurred background image slideshow ── */}
      <AbsoluteFill style={{ zIndex: 1 }}>
        <LoopingImageSlider
          images={images}
          startFrame={0}
          totalDurationInFrames={totalDuration}
          slideDurationInFrames={imageDurationInFrames}
          isBackgroundMode={false}
        />
      </AbsoluteFill>

      {/* ── LAYER 2: Dark overlay for readability ── */}
      <AbsoluteFill
        style={{
          zIndex: 2,
          backgroundColor: 'rgba(0, 0, 0, 0.58)',
        }}
      />

      {/* ── LAYER 3: Per-track sequences ── */}
      <AbsoluteFill style={{ zIndex: 3 }}>
        {audioFiles.map((audioSrc, i) => {
          const startFrame = cumulativeStarts[i] ?? 0;
          const durationInFrames = audioDurationsInFrames[i] ?? 0;
          if (durationInFrames <= 0) return null;

          return (
            <Sequence
              key={`track-${i}`}
              from={startFrame}
              durationInFrames={durationInFrames}
              layout="none"
            >
              <TrackSequence
                audioSrc={audioSrc}
                images={images}
                imageDurationInFrames={imageDurationInFrames}
                artistName={artistName}
                accentColor={accentColor}
                waveformStyle={waveformStyle}
                numberOfBars={numberOfBars}
                orientation={orientation}
                title={title}
                heroImage={heroImage}
                textBackgroundColor={textBackgroundColor}
                textBackgroundOpacity={textBackgroundOpacity}
              />
            </Sequence>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
