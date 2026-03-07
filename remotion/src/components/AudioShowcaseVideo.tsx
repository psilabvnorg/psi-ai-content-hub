import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {useWindowedAudioData, visualizeAudio} from "@remotion/media-utils";
import type {Caption} from "@remotion/captions";

import type {AudioShowcaseResolvedProps} from "../families/audio-showcase/calculateMetadata";
import {CaptionDisplay} from "./CaptionDisplay";
import {LoopingImageSlider} from "./LoopingImageSlider";
import {SoundWave} from "./SoundWave";
import {TrackInfo, deriveTitleFromPath} from "./TrackInfo";

// ─── Cover Art ────────────────────────────────────────────────────────────────

interface CoverArtProps {
  images: string[];
  frame: number;
  imageDurationInFrames: number;
  bassIntensity: number;
  orientation: "vertical" | "horizontal";
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
  const hasSrc = heroImage || images.length > 0;
  if (!hasSrc) return null;

  const imgIndex = Math.floor(frame / imageDurationInFrames) % images.length;
  const src = heroImage || images[imgIndex];

  const frameInSlide = frame % imageDurationInFrames;
  const panX = interpolate(frameInSlide, [0, imageDurationInFrames], [-8, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const coverScale = 1 + bassIntensity * 0.05;

  if (orientation === "horizontal") {
    return (
      <div
        style={{
          width: 480,
          height: 480,
          borderRadius: 24,
          overflow: "hidden",
          boxShadow: `0 0 60px rgba(0,0,0,0.8), 0 0 ${20 + bassIntensity * 30}px rgba(168,85,247,0.4)`,
          transform: `scale(${coverScale})`,
          flexShrink: 0,
        }}
      >
        <Img
          src={src}
          style={{width: "100%", height: "100%", objectFit: "cover", transform: `translateX(${panX}px)`}}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: 560,
        height: 560,
        borderRadius: 28,
        overflow: "hidden",
        boxShadow: `0 0 80px rgba(0,0,0,0.8), 0 0 ${20 + bassIntensity * 40}px rgba(168,85,247,0.5)`,
        transform: `scale(${coverScale})`,
      }}
    >
      <Img
        src={src}
        style={{width: "100%", height: "100%", objectFit: "cover", transform: `translateX(${panX}px)`}}
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
  waveformStyle: "bars" | "wave";
  numberOfBars: number;
  orientation: "vertical" | "horizontal";
  title: string;
  heroImage: string;
  textBackgroundColor: string;
  textBackgroundOpacity: number;
  captions: Caption[];
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
  captions,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const {audioData, dataOffsetInSeconds} = useWindowedAudioData({
    src: audioSrc,
    frame,
    fps,
    windowInSeconds: 30,
  });

  let bassIntensity = 0;
  if (audioData) {
    const frequencies = visualizeAudio({
      fps,
      frame,
      audioData,
      numberOfSamples: 128,
      optimizeFor: "speed",
      dataOffsetInSeconds,
    });
    bassIntensity = frequencies.slice(0, 32).reduce((sum, v) => sum + v, 0) / 32;
  }

  const trackTitle = title || deriveTitleFromPath(audioSrc);
  const waveHeight = orientation === "vertical" ? 160 : 100;

  if (orientation === "horizontal") {
    return (
      <AbsoluteFill>
        <Audio src={audioSrc} />
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
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
          <div style={{flex: 1, height: "100%"}}>
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
        <AbsoluteFill style={{display: "flex", flexDirection: "column", justifyContent: "flex-end"}}>
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
        <CaptionDisplay captions={captions} />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      <Audio src={audioSrc} />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
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
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingTop: 680,
          paddingBottom: 400,
          paddingLeft: 40,
          paddingRight: 40,
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
      <AbsoluteFill style={{display: "flex", flexDirection: "column", justifyContent: "flex-end"}}>
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
      <CaptionDisplay captions={captions} />
    </AbsoluteFill>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const AudioShowcaseVideo: React.FC<AudioShowcaseResolvedProps> = ({
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
  trackCaptions,
}) => {
  const {durationInFrames: totalDuration} = useVideoConfig();

  const cumulativeStarts: number[] = [];
  let cumulative = 0;
  for (const dur of audioDurationsInFrames) {
    cumulativeStarts.push(cumulative);
    cumulative += dur;
  }

  return (
    <AbsoluteFill style={{backgroundColor: "#000"}}>
      <AbsoluteFill style={{zIndex: 1}}>
        <LoopingImageSlider
          images={images}
          startFrame={0}
          totalDurationInFrames={totalDuration}
          slideDurationInFrames={imageDurationInFrames}
          isBackgroundMode={false}
        />
      </AbsoluteFill>

      <AbsoluteFill style={{zIndex: 2, backgroundColor: "rgba(0, 0, 0, 0.58)"}} />

      <AbsoluteFill style={{zIndex: 3}}>
        {audioFiles.map((audioSrc, i) => {
          const startFrame = cumulativeStarts[i] ?? 0;
          const durationInFrames = audioDurationsInFrames[i] ?? 0;
          if (durationInFrames <= 0) return null;

          return (
            <Sequence key={`track-${i}`} from={startFrame} durationInFrames={durationInFrames} layout="none">
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
                captions={trackCaptions[i] ?? []}
              />
            </Sequence>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
