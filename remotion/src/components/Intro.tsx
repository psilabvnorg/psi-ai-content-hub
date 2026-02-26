import { AbsoluteFill, Img, staticFile, useVideoConfig } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Montserrat';
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import { getTemplateAssets } from '../utils/getStaticAssets';

const { fontFamily } = loadFont('normal', {
  weights: ['400', '700', '800'],
  subsets: ['latin', 'vietnamese'],
});

export const introSchema = z.object({
  // === TEMPLATE ===
  templateId: z.string().default('template_1').describe('Template ID (e.g., template_1, template_2)'),

  // === DYNAMIC TEMPLATE ASSETS (auto-loaded if empty) ===
  templateLogos: z.array(z.string()).optional().describe('Logo images (auto-loaded from templates/{templateId}/logo)'),
  templateIcons: z.array(z.string()).optional().describe('Icon images (auto-loaded from templates/{templateId}/icons)'),
  templateElements: z.array(z.string()).optional().describe('Decorative elements (auto-loaded from templates/{templateId}/elements)'),
  templateSounds: z.array(z.string()).optional().describe('Sound files (auto-loaded from templates/{templateId}/sound)'),
  templateBackgrounds: z.array(z.string()).optional().describe('Background patterns (auto-loaded from templates/{templateId})'),

  // === CONTENT ===
  title: z.string().describe('Main title text'),
  brandName: z.string().describe('Brand name'),
  tagline: z.string().describe('Tagline text'),
  url: z.string().describe('Website URL'),

  // === BACKGROUND ===
  backgroundImage: z.string().optional().describe('Background image path (optional)'),
  gradientTopColor: z.string().describe('Gradient overlay top color (hex or rgba)'),
  gradientBottomColor: z.string().describe('Gradient overlay bottom color (hex or rgba)'),
  gradientOpacity: z.number().min(0).max(1).step(0.05).describe('Gradient overlay opacity (use 1 if using rgba colors)'),
  showBackgroundPattern: z.boolean().describe('Show background pattern'),
  backgroundPatternOpacity: z.number().min(0).max(1).step(0.1).describe('Pattern opacity'),

  // === TOP LOGO (Corner) ===
  showTopLogo: z.boolean().describe('Show top logo'),
  topLogoX: z.number().min(-5000).max(5000).step(10).describe('Top logo X position'),
  topLogoY: z.number().min(-5000).max(5000).step(10).describe('Top logo Y position'),
  topLogoSize: z.number().min(40).max(200).step(10).describe('Top logo size'),

  // === BRAND SECTION ===
  showBrandLogo: z.boolean().describe('Show brand logo box'),
  brandSectionX: z.number().min(-5000).max(5000).step(10).describe('Brand section X position'),
  brandSectionY: z.number().min(-5000).max(5000).step(10).describe('Brand section Y position'),
  brandLogoSize: z.number().min(50).max(200).step(10).describe('Brand logo box size'),
  brandNameSize: z.number().min(20).max(120).step(2).describe('Brand name font size'),
  brandNameColor: zColor().describe('Brand name color'),
  accentColor: zColor().describe('Logo border color'),

  // === TAGLINE ===
  taglineX: z.number().min(-5000).max(5000).step(10).describe('Tagline X position'),
  taglineY: z.number().min(-5000).max(5000).step(10).describe('Tagline Y position'),
  taglineSize: z.number().min(12).max(60).step(2).describe('Tagline font size'),
  taglineColor: zColor().describe('Tagline color'),

  // === TITLE ===
  titleX: z.number().min(-5000).max(5000).step(10).describe('Title X position'),
  titleY: z.number().min(-5000).max(5000).step(10).describe('Title Y position'),
  titleSize: z.number().min(20).max(120).step(2).describe('Title font size'),
  titleColor: zColor().describe('Title color'),

  // === SOCIAL ICONS ===
  showSocialIcons: z.boolean().describe('Show social icons'),
  socialSectionX: z.number().min(-5000).max(5000).step(10).describe('Social section X position'),
  socialSectionY: z.number().min(-5000).max(5000).step(10).describe('Social section Y position'),
  socialIconSize: z.number().min(20).max(100).step(5).describe('Social icon size'),
  showFacebook: z.boolean().describe('Show Facebook'),
  showTikTok: z.boolean().describe('Show TikTok'),
  showYouTube: z.boolean().describe('Show YouTube'),
  showInstagram: z.boolean().describe('Show Instagram'),

  // === URL ===
  urlX: z.number().min(-5000).max(5000).step(10).describe('URL X offset (from social icons)'),
  urlSize: z.number().min(12).max(60).step(2).describe('URL font size'),
  urlColor: zColor().describe('URL color'),

  // === DECORATIVE ELEMENTS ===
  showMoneyElement: z.boolean().describe('Show money element'),
  moneyElementX: z.number().min(-5000).max(5000).step(10).describe('Money element X position'),
  moneyElementY: z.number().min(-5000).max(5000).step(10).describe('Money element Y position'),
  moneyElementSize: z.number().min(50).max(400).step(10).describe('Money element size'),
  moneyElementOpacity: z.number().min(0).max(1).step(0.1).describe('Money element opacity'),

  showProfitElement: z.boolean().describe('Show profit element'),
  profitElementX: z.number().min(-5000).max(5000).step(10).describe('Profit element X position'),
  profitElementY: z.number().min(-5000).max(5000).step(10).describe('Profit element Y position'),
  profitElementSize: z.number().min(50).max(800).step(10).describe('Profit element size'),
  profitElementOpacity: z.number().min(0).max(1).step(0.1).describe('Profit element opacity'),

  // === AUDIO ===
  enableAudio: z.boolean().describe('Enable background music'),
  audioVolume: z.number().min(0).max(1).step(0.05).describe('Music volume'),

  // === ANIMATION ===
  animationSpeed: z.number().min(0.5).max(2).step(0.1).describe('Animation speed'),
});

export type IntroProps = z.infer<typeof introSchema>;

// Props for IntroOverlay (used in MainVideo layered architecture)
interface IntroOverlayProps extends IntroProps {
  isBackgroundMode?: boolean; // When true, skip background image (media plays behind)
}

/**
 * Helper function to get template assets and paths
 */
const useTemplateAssets = (props: IntroProps) => {
  const templateId = props.templateId || 'template_1';
  const templatePath = (asset: string) => staticFile(`templates/${templateId}/${asset}`);
  const templateAssets = getTemplateAssets(templateId);

  // Use provided assets or fall back to auto-loaded ones
  const logos = props.templateLogos?.length ? props.templateLogos : templateAssets.logos;
  const icons = props.templateIcons?.length ? props.templateIcons : templateAssets.icons;
  const elements = props.templateElements?.length ? props.templateElements : templateAssets.elements;
  const sounds = props.templateSounds?.length ? props.templateSounds : templateAssets.sounds;
  const backgrounds = props.templateBackgrounds?.length ? props.templateBackgrounds : templateAssets.backgrounds;

  // Helper to get asset by pattern
  const getAssetByPattern = (assets: string[], pattern: string): string | undefined => {
    return assets.find((a) => a.toLowerCase().includes(pattern.toLowerCase()));
  };

  return {
    templateId,
    templatePath,
    logos,
    icons,
    elements,
    sounds,
    backgrounds,
    getAssetByPattern,
    // Specific assets
    topLogo: getAssetByPattern(logos, 'top') || logos[0] || templatePath('logo/logo_top.png'),
    midLogo: getAssetByPattern(logos, 'mid') || logos[1] || logos[0] || templatePath('logo/logo_mid.png'),
    backgroundPattern: getAssetByPattern(backgrounds, 'background') || backgrounds[0] || templatePath('tiktok_background.png'),
    backgroundMusic: sounds[0] || templatePath('sound/background_music.mp3'),
    moneyElement: getAssetByPattern(elements, 'money') || elements[0] || templatePath('elements/element1.png'),
    profitElement: getAssetByPattern(elements, 'profit') || elements[1] || elements[0] || templatePath('elements/element2.png'),
  };
};

/**
 * Build social icons array from props
 */
const useSocialIcons = (props: IntroProps, icons: string[], templatePath: (asset: string) => string) => {
  const getAssetByPattern = (assets: string[], pattern: string): string | undefined => {
    return assets.find((a) => a.toLowerCase().includes(pattern.toLowerCase()));
  };

  const socialIconMap = [
    { name: 'facebook', show: props.showFacebook },
    { name: 'tiktok', show: props.showTikTok },
    { name: 'youtube', show: props.showYouTube },
    { name: 'instagram', show: props.showInstagram },
  ];

  return socialIconMap
    .filter((icon) => icon.show)
    .map((icon) => ({
      name: icon.name,
      src: getAssetByPattern(icons, icon.name) || templatePath(`icons/${icon.name}.png`),
    }));
};

/**
 * IntroOverlay - Used in MainVideo for layered architecture
 * Normal mode: Background image + full-screen gradient overlay with original positioning
 * Background mode: Bottom half solid color block with content in bottom half
 */
export const IntroOverlay: React.FC<IntroOverlayProps> = (props) => {
  const { isBackgroundMode = false } = props;
  const { height } = useVideoConfig();
  const assets = useTemplateAssets(props);
  const socialIcons = useSocialIcons(props, assets.icons, assets.templatePath);

  // Background mode: bottom half layout
  if (isBackgroundMode) {
    const bottomHalfStart = height / 2;
    const contentPadding = 40;

    return (
      <AbsoluteFill>
        {/* LAYER 2: Solid Color Block (BOTTOM HALF) */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            width: '100%',
            height: '50%',
            backgroundColor: props.gradientBottomColor,
            opacity: props.gradientOpacity,
            zIndex: 10,
          }}
        >
          {props.showBackgroundPattern && assets.backgroundPattern && (
            <Img
              src={assets.backgroundPattern}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: props.backgroundPatternOpacity,
                mixBlendMode: 'overlay',
              }}
            />
          )}
        </div>

        {/* LAYER 1: Content (BOTTOM HALF) */}
        <AbsoluteFill style={{ zIndex: 20, overflow: 'visible' }}>
          {props.showTopLogo && assets.topLogo && (
            <div
              style={{
                position: 'absolute',
                right: contentPadding,
                top: bottomHalfStart + 20,
                width: `${props.topLogoSize}px`,
                height: `${props.topLogoSize}px`,
              }}
            >
              <Img src={assets.topLogo} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          )}

          <div
            style={{
              position: 'absolute',
              left: contentPadding,
              top: bottomHalfStart + 80,
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
            }}
          >
            {props.showBrandLogo && assets.midLogo && (
              <div
                style={{
                  width: `${props.brandLogoSize}px`,
                  height: `${props.brandLogoSize}px`,
                  padding: '10px',
                  border: `3px solid ${props.accentColor}`,
                  borderRadius: '8px',
                }}
              >
                <Img src={assets.midLogo} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            )}
            <div style={{ fontFamily, fontSize: `${props.brandNameSize}px`, fontWeight: '700', color: props.brandNameColor, letterSpacing: '2px' }}>
              {props.brandName}
            </div>
          </div>

          <div
            style={{
              position: 'absolute',
              left: contentPadding,
              top: bottomHalfStart + 230,
              fontFamily,
              fontSize: `${props.taglineSize}px`,
              fontWeight: '400',
              color: props.taglineColor,
              letterSpacing: '1px',
            }}
          >
            {props.tagline}
          </div>

          <div
            style={{
              position: 'absolute',
              left: contentPadding,
              top: bottomHalfStart + 290,
              width: '90%',
              fontFamily,
              fontSize: `${props.titleSize}px`,
              fontWeight: '800',
              color: props.titleColor,
              lineHeight: 1.2,
            }}
          >
            {props.title}
          </div>

          <div
            style={{
              position: 'absolute',
              left: contentPadding,
              top: bottomHalfStart + 520,
              display: 'flex',
              alignItems: 'center',
              gap: '25px',
            }}
          >
            {props.showSocialIcons && socialIcons.map((icon) => (
              <div key={icon.name}>
                <Img src={icon.src!} style={{ width: `${props.socialIconSize}px`, height: `${props.socialIconSize}px`, objectFit: 'contain' }} />
              </div>
            ))}
            <div style={{ fontFamily, fontSize: `${props.urlSize}px`, fontWeight: '400', color: props.urlColor, marginLeft: `${props.urlX}px` }}>
              {props.url}
            </div>
          </div>

          {props.showMoneyElement && assets.moneyElement && (
            <div
              style={{
                position: 'absolute',
                left: contentPadding,
                top: bottomHalfStart + 250,
                width: `${props.moneyElementSize}px`,
                height: `${props.moneyElementSize}px`,
                opacity: props.moneyElementOpacity,
              }}
            >
              <Img src={assets.moneyElement} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          )}

          {props.showProfitElement && assets.profitElement && (
            <div
              style={{
                position: 'absolute',
                right: contentPadding,
                top: bottomHalfStart + 350,
                width: `${props.profitElementSize * 0.5}px`,
                height: `${props.profitElementSize * 0.5}px`,
                opacity: props.profitElementOpacity,
              }}
            >
              <Img src={assets.profitElement} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          )}
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // Normal mode: full-screen with background image and gradient overlay
  return (
    <AbsoluteFill>
      {/* Background Image (Photo) */}
      {props.backgroundImage && (
        <AbsoluteFill style={{ zIndex: 5 }}>
          <Img
            src={
              props.backgroundImage.startsWith('http') || props.backgroundImage.startsWith('/')
                ? props.backgroundImage
                : staticFile(props.backgroundImage)
            }
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </AbsoluteFill>
      )}

      {/* LAYER 2: Full-screen Gradient Overlay */}
      <AbsoluteFill style={{ zIndex: 10 }}>
        <AbsoluteFill
          style={{
            background: `linear-gradient(180deg, ${props.gradientTopColor} 0%, ${props.gradientBottomColor} 100%)`,
            opacity: props.gradientOpacity,
          }}
        />
        {props.showBackgroundPattern && assets.backgroundPattern && (
          <AbsoluteFill>
            <Img
              src={assets.backgroundPattern}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: props.backgroundPatternOpacity,
                mixBlendMode: 'overlay',
              }}
            />
          </AbsoluteFill>
        )}
      </AbsoluteFill>

      {/* LAYER 1: Content with original positioning */}
      <AbsoluteFill style={{ zIndex: 20, overflow: 'visible' }}>
        {props.showTopLogo && assets.topLogo && (
          <div
            style={{
              position: 'absolute',
              left: `${props.topLogoX}px`,
              top: `${props.topLogoY}px`,
              width: `${props.topLogoSize}px`,
              height: `${props.topLogoSize}px`,
            }}
          >
            <Img src={assets.topLogo} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            left: `${props.brandSectionX}px`,
            top: `${props.brandSectionY}px`,
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
          }}
        >
          {props.showBrandLogo && assets.midLogo && (
            <div
              style={{
                width: `${props.brandLogoSize}px`,
                height: `${props.brandLogoSize}px`,
                padding: '10px',
                border: `3px solid ${props.accentColor}`,
                borderRadius: '8px',
              }}
            >
              <Img src={assets.midLogo} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          )}
          <div style={{ fontFamily, fontSize: `${props.brandNameSize}px`, fontWeight: '700', color: props.brandNameColor, letterSpacing: '2px' }}>
            {props.brandName}
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            left: `${props.taglineX}px`,
            top: `${props.taglineY}px`,
            fontFamily,
            fontSize: `${props.taglineSize}px`,
            fontWeight: '400',
            color: props.taglineColor,
            letterSpacing: '1px',
          }}
        >
          {props.tagline}
        </div>

        <div
          style={{
            position: 'absolute',
            left: `${props.titleX}px`,
            top: `${props.titleY}px`,
            fontFamily,
            fontSize: `${props.titleSize}px`,
            fontWeight: '800',
            color: props.titleColor,
            lineHeight: 1.2,
          }}
        >
          {props.title}
        </div>

        <div
          style={{
            position: 'absolute',
            left: `${props.socialSectionX}px`,
            top: `${props.socialSectionY}px`,
            display: 'flex',
            alignItems: 'center',
            gap: '25px',
          }}
        >
          {props.showSocialIcons && socialIcons.map((icon) => (
            <div key={icon.name}>
              <Img src={icon.src!} style={{ width: `${props.socialIconSize}px`, height: `${props.socialIconSize}px`, objectFit: 'contain' }} />
            </div>
          ))}
          <div style={{ fontFamily, fontSize: `${props.urlSize}px`, fontWeight: '400', color: props.urlColor, marginLeft: `${props.urlX}px` }}>
            {props.url}
          </div>
        </div>

        {props.showMoneyElement && assets.moneyElement && (
          <div
            style={{
              position: 'absolute',
              left: `${props.moneyElementX}px`,
              top: `${props.moneyElementY}px`,
              width: `${props.moneyElementSize}px`,
              height: `${props.moneyElementSize}px`,
              opacity: props.moneyElementOpacity,
            }}
          >
            <Img src={assets.moneyElement} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        )}

        {props.showProfitElement && assets.profitElement && (
          <div
            style={{
              position: 'absolute',
              left: `${props.profitElementX}px`,
              top: `${props.profitElementY}px`,
              width: `${props.profitElementSize}px`,
              height: `${props.profitElementSize}px`,
              opacity: props.profitElementOpacity,
            }}
          >
            <Img src={assets.profitElement} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
