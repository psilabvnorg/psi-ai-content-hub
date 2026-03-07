import React from "react";
import {AbsoluteFill} from "remotion";

import {NewsIntroHorizontal} from "../../components/NewsIntroHorizontal";
import {NewsIntroVertical} from "../../components/NewsIntroVertical";
import type {NewsIntroResolvedProps} from "./calculateMetadata";

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

export const NewsIntroComposition: React.FC<NewsIntroResolvedProps> = (props) => {
  if (props.isPlaceholder) {
    return <AbsoluteFill style={placeholderStyle}>{props.placeholderTitle}</AbsoluteFill>;
  }

  return props.orientation === "horizontal" ? (
    <NewsIntroHorizontal
      leftImage={props.introProps.image1}
      rightImage={props.introProps.image2}
      heroImage={props.introProps.heroImage}
    />
  ) : (
    <NewsIntroVertical
      topImage={props.introProps.image1}
      bottomImage={props.introProps.image2}
      heroImage={props.introProps.heroImage}
    />
  );
};
