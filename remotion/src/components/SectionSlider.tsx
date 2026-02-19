import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';

const { fontFamily } = loadFont('normal', {
  weights: ['600', '700'],
  subsets: ['latin', 'vietnamese'],
});

const BAR_BG      = 'rgba(0, 0, 0, 0.55)';
const TEXT_ACTIVE = '#ffffff';
const TEXT_INACTIVE = 'rgba(255, 255, 255, 0.45)';

interface Section {
  title: string;
  startMs: number;
}

interface SectionSliderProps {
  sections: Section[];
  orientation: 'vertical' | 'horizontal';
}

const findLastActiveIndex = (sections: Section[], currentMs: number): number => {
  let result = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].startMs <= currentMs) result = i;
  }
  return result;
};

export const SectionSlider: React.FC<SectionSliderProps> = ({ sections, orientation }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  if (!sections || sections.length === 0) return null;

  const currentMs = (frame / fps) * 1000;
  const totalMs   = (durationInFrames / fps) * 1000;
  const activeIdx = findLastActiveIndex(sections, currentMs);

  const sectionStartMs = sections[activeIdx].startMs;
  const sectionEndMs   = sections[activeIdx + 1]?.startMs ?? totalMs;
  const sectionDurMs   = sectionEndMs - sectionStartMs;

  const fillProgress = sectionDurMs > 0
    ? interpolate(currentMs, [sectionStartMs, sectionEndMs], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 1;

  // ── Vertical: horizontal bar at top ──────────────────────────────────────
  if (orientation === 'vertical') {
    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: 150,
          backgroundColor: BAR_BG,
          borderBottom: '1px solid rgba(255,255,255,0.10)',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 60,
          paddingLeft: 48,
          paddingRight: 48,
          boxSizing: 'border-box',
        }}
      >
        {sections.map((section, i) => {
          const isActive = i === activeIdx;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span
                style={{
                  fontFamily,
                  fontSize: 44,
                  fontWeight: isActive ? '700' : '600',
                  color: isActive ? TEXT_ACTIVE : TEXT_INACTIVE,
                  letterSpacing: '0.5px',
                  whiteSpace: 'nowrap',
                  textShadow: isActive ? '0 2px 8px rgba(0,0,0,0.8)' : 'none',
                }}
              >
                {section.title}
              </span>

              {/* Progress underline — only rendered for all items so layout is stable */}
              <div
                style={{
                  width: '100%',
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  overflow: 'hidden',
                }}
              >
                {isActive && (
                  <div
                    style={{
                      height: '100%',
                      width: `${fillProgress * 100}%`,
                      backgroundColor: '#ffffff',
                      borderRadius: 2,
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Horizontal: vertical sidebar on right ────────────────────────────────
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 340,
        height: '100%',
        backgroundColor: BAR_BG,
        borderLeft: '1px solid rgba(255,255,255,0.10)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 40,
        paddingTop: 32,
        paddingBottom: 32,
        paddingLeft: 32,
        paddingRight: 32,
        boxSizing: 'border-box',
      }}
    >
      {sections.map((section, i) => {
        const isActive = i === activeIdx;
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 16,
              width: '100%',
            }}
          >
            {/* Left progress bar track */}
            <div
              style={{
                width: 4,
                borderRadius: 2,
                backgroundColor: 'rgba(255,255,255,0.15)',
                flexShrink: 0,
                // Use a min height so the track is always visible
                minHeight: 50,
                alignSelf: 'stretch',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${fillProgress * 100}%`,
                    backgroundColor: '#ffffff',
                    borderRadius: 2,
                  }}
                />
              )}
            </div>

            <span
              style={{
                fontFamily,
                fontSize: 40,
                fontWeight: isActive ? '700' : '600',
                color: isActive ? TEXT_ACTIVE : TEXT_INACTIVE,
                letterSpacing: '0.5px',
                lineHeight: 1.3,
                textShadow: isActive ? '0 2px 8px rgba(0,0,0,0.8)' : 'none',
              }}
            >
              {section.title}
            </span>
          </div>
        );
      })}
    </div>
  );
};
