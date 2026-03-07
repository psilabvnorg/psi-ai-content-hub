import React from "react";
import {AbsoluteFill} from "remotion";

import {AudioShowcaseVideo} from "../../components/AudioShowcaseVideo";
import type {AudioShowcaseResolvedProps} from "./calculateMetadata";

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

export const AudioShowcaseComposition: React.FC<AudioShowcaseResolvedProps> = (props) => {
  if (props.isPlaceholder) {
    return <AbsoluteFill style={placeholderStyle}>{props.placeholderTitle}</AbsoluteFill>;
  }

  return <AudioShowcaseVideo {...props} />;
};
