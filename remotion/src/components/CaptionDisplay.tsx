import { useMemo } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { createTikTokStyleCaptions } from '@remotion/captions';
import type { Caption, TikTokPage } from '@remotion/captions';
import { loadFont } from '@remotion/google-fonts/Montserrat';

const { fontFamily } = loadFont('normal', {
  weights: ['700', '800'],
  subsets: ['latin', 'vietnamese'],
});

// How often captions should switch (in milliseconds)
const SWITCH_CAPTIONS_EVERY_MS = 1200;

const HIGHLIGHT_COLOR = '#FFFF00'; // Yellow highlight
const TEXT_COLOR = '#FFFFFF'; // White text

interface CaptionDisplayProps {
  captions: Caption[];
  introDurationInFrames?: number;
}

const CaptionPage: React.FC<{ page: TikTokPage }> = ({ page }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Current time relative to the start of the sequence
  const currentTimeMs = (frame / fps) * 1000;
  // Convert to absolute time by adding the page start
  const absoluteTimeMs = page.startMs + currentTimeMs;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          bottom: '10%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          textAlign: 'center',
          fontSize: 64,
          fontWeight: '800',
          fontFamily,
          textShadow: '0 0 10px rgba(0, 0, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.9)',
          lineHeight: 1.3,
        }}
      >
        {page.tokens.map((token, index) => {
          const isActive =
            token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;

          return (
            <span
              key={`${token.fromMs}-${index}`}
              style={{
                color: isActive ? HIGHLIGHT_COLOR : TEXT_COLOR,
              }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const CaptionDisplay: React.FC<CaptionDisplayProps> = ({ captions, introDurationInFrames = 0 }) => {
  const { fps } = useVideoConfig();

  const { pages } = useMemo(() => {
    return createTikTokStyleCaptions({
      captions,
      combineTokensWithinMilliseconds: SWITCH_CAPTIONS_EVERY_MS,
    });
  }, [captions]);

  if (!captions || captions.length === 0) {
    return null;
  }

  return (
    <AbsoluteFill>
      {pages.map((page, index) => {
        const nextPage = pages[index + 1] ?? null;
        const startFrame = (page.startMs / 1000) * fps;
        const endFrame = Math.min(
          nextPage ? (nextPage.startMs / 1000) * fps : Infinity,
          startFrame + (SWITCH_CAPTIONS_EVERY_MS / 1000) * fps,
        );
        const durationInFrames = endFrame - startFrame;

        // Skip captions that end before the intro finishes
        if (endFrame <= introDurationInFrames) {
          return null;
        }

        if (durationInFrames <= 0) {
          return null;
        }

        // Adjust start frame to not show during intro, but keep original timing
        const adjustedStartFrame = Math.max(startFrame, introDurationInFrames);
        const adjustedDuration = endFrame - adjustedStartFrame;

        if (adjustedDuration <= 0) {
          return null;
        }

        return (
          <Sequence
            key={index}
            from={adjustedStartFrame}
            durationInFrames={adjustedDuration}
            layout="none"
          >
            <CaptionPage page={page} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
