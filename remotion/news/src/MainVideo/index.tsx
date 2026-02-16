import { AbsoluteFill, Audio, Sequence, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { IntroOverlay, introSchema } from '../Intro';
import { LoopingImageSlider } from '../components/LoopingImageSlider';
import { CaptionDisplay } from '../components/CaptionDisplay';
import type { Caption } from '@remotion/captions';
import { getFirstAudioFromDirectory } from '../utils/getStaticAssets';

export const mainVideoSchema = z.object({
  // Intro props
  introProps: introSchema,

  // Content directory for dynamic asset loading (e.g., 'main/video_1')
  contentDirectory: z.string().describe('Directory path for content assets (e.g., main/video_1)'),

  // Image paths (auto-loaded from contentDirectory if empty)
  images: z.array(z.string()).default([]).describe('Array of image paths'),

  // Video paths and durations (auto-loaded from contentDirectory if empty)
  videos: z.array(z.string()).default([]).describe('Array of video paths (MP4)'),
  videoDurations: z.array(z.number()).default([]).describe('Array of video durations in frames'),

  // Audio path (auto-loaded from contentDirectory/audio if empty)
  audioSrc: z.string().optional().describe('Audio file path'),

  // Captions
  captions: z.array(z.any()).optional().describe('Optional captions array'),

  // Video orientation
  orientation: z.enum(['vertical', 'horizontal']).default('vertical').describe('Video orientation: vertical (1080x1920) or horizontal (1920x1080)'),

  // Timing
  backgroundMode: z.boolean().default(false).describe('When true, intro overlay stays for entire video with images playing behind'),
  introDurationInFrames: z.number().describe('Intro duration in frames (only used when backgroundMode is false)'),
  imageDurationInFrames: z.number().describe('Duration per image in frames'),
});

export type MainVideoProps = z.infer<typeof mainVideoSchema>;

export const MainVideo: React.FC<MainVideoProps> = ({
  introProps,
  images,
  audioSrc,
  captions,
  backgroundMode = false,
  introDurationInFrames,
  imageDurationInFrames,
}) => {
  const { durationInFrames: totalDuration } = useVideoConfig();

  // Background mode: intro overlay stays for entire video, images play behind
  // Normal mode: intro plays for introDurationInFrames, then disappears
  const effectiveIntroDuration = backgroundMode ? totalDuration : introDurationInFrames;
  const mediaStartFrame = backgroundMode ? 0 : introDurationInFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* ========== LAYER 3 (BOTTOM): Images and Videos ========== */}
      <AbsoluteFill style={{ zIndex: 1 }}>
        <LoopingImageSlider
          images={images}
          startFrame={mediaStartFrame}
          totalDurationInFrames={totalDuration}
          slideDurationInFrames={imageDurationInFrames}
          isBackgroundMode={backgroundMode}
        />
      </AbsoluteFill>

      {/* ========== LAYER 2 (MIDDLE): Background Overlay from Intro ========== */}
      {/* ========== LAYER 1 (TOP): Text, Icons, Logo from Intro ========== */}
      <Sequence durationInFrames={effectiveIntroDuration} layout="none">
        <IntroOverlay {...introProps} isBackgroundMode={backgroundMode} />
      </Sequence>

      {/* ========== AUDIO LAYERS ========== */}
      {/* Voice/Narration Audio */}
      {audioSrc && <Audio src={audioSrc} />}

      {/* Background Music - Loops to play for entire video */}
      {(() => {
        const templateId = introProps.templateId || 'template_1';
        const bgMusic = getFirstAudioFromDirectory(`templates/${templateId}/sound`);
        if (bgMusic) {
          return <Audio src={bgMusic} loop volume={() => 0.3} />;
        }
        return null;
      })()}

      {/* ========== CAPTIONS OVERLAY (TOP-MOST) ========== */}
      {captions && captions.length > 0 && (
        <AbsoluteFill style={{ zIndex: 100 }}>
          <CaptionDisplay
            captions={captions as Caption[]}
            introDurationInFrames={0}
          />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
