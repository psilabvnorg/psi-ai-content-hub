import React from "react";
import {
  AbsoluteFill,
  Img,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import {NewsIntroHorizontal} from "../../components/NewsIntroHorizontal";
import {NewsIntroVertical} from "../../components/NewsIntroVertical";
import {NewsVideoBase} from "../../components/NewsVideo";
import type {NewsAnchorResolvedProps} from "./schema";

const fill: React.CSSProperties = {width: "100%", height: "100%", objectFit: "fill"};

const placeholderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#060606",
  color: "#f5f5f5",
  fontSize: 42,
  fontWeight: 700,
  textAlign: "center",
  padding: 64,
};

const HeroPersistentOverlay: React.FC<{src: string}> = ({src}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const heroSize = (height / 4) * 2.7;
  const breathCycle = (frame / fps) * (Math.PI * 2) / 3;
  const breathScale = 1 + 0.05 * Math.sin(breathCycle);
  const heroLeft = width * 0.75 - heroSize / 2;
  const heroTop = (height - heroSize) / 2 - height * 0.1;

  return (
    <div
      style={{
        position: "absolute",
        top: heroTop,
        left: heroLeft,
        width: heroSize,
        height: heroSize,
        transform: `scale(${breathScale})`,
        transformOrigin: "center center",
      }}
    >
      <Img
        src={src}
        style={{width: "100%", height: "100%", objectFit: "contain"}}
      />
    </div>
  );
};

export const NewsAnchorComposition: React.FC<NewsAnchorResolvedProps> = (props) => {
  if (props.isPlaceholder) {
    return <AbsoluteFill style={placeholderStyle}>{props.placeholderTitle}</AbsoluteFill>;
  }

  const intro = props.variant === "cnn"
    ? <></>
    : props.orientation === "horizontal"
      ? (
        <NewsIntroHorizontal
          leftImage={props.introProps.image1}
          rightImage={props.introProps.image2}
          heroImage={props.introProps.heroImage}
          showHeroImage={!props.heroOverlayImage}
        />
      )
      : (
        <NewsIntroVertical
          topImage={props.introProps.image1}
          bottomImage={props.introProps.image2}
          heroImage={props.introProps.heroImage}
        />
      );

  const postIntroOverlay = props.backgroundMode
    ? props.backgroundOverlayImage
      ? <Img src={props.backgroundOverlayImage} style={fill} />
      : undefined
    : props.overlayImage
      ? <Img src={props.overlayImage} style={fill} />
      : undefined;

  return (
    <AbsoluteFill>
      <NewsVideoBase
        images={props.images}
        introDurationInFrames={props.introDurationInFrames}
        imageDurationInFrames={props.imageDurationInFrames}
        audioSrc={props.audioSrc}
        captions={props.captions}
        sections={props.sections}
        orientation={props.orientation}
        isBackgroundMode={props.backgroundMode}
        isHorizontalBackground={props.orientation === "horizontal" && props.backgroundMode}
        captionBottomPercent={props.captionBottomPercent}
        intro={intro}
        postIntroOverlay={postIntroOverlay}
      />
      {props.orientation === "horizontal" && props.backgroundMode && props.heroOverlayImage ? (
        <AbsoluteFill style={{zIndex: 200, pointerEvents: "none"}}>
          <HeroPersistentOverlay src={props.heroOverlayImage} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
