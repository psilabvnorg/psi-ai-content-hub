import "./../index.css";

import React from "react";
import {Composition} from "remotion";

import {workspaceCompositionSchema} from "../core/workspace/baseSchema";
import {AudioKaraokeComposition} from "../families/audio-karaoke/AudioKaraokeComposition";
import {calculateAudioKaraokeMetadata} from "../families/audio-karaoke/calculateMetadata";
import {calculateAudioShowcaseMetadata} from "../families/audio-showcase/calculateMetadata";
import {AudioShowcaseComposition} from "../families/audio-showcase/AudioShowcaseComposition";
import {calculateNewsAnchorMetadata} from "../families/news-anchor/calculateMetadata";
import {NewsAnchorComposition} from "../families/news-anchor/NewsAnchorComposition";
import {calculateNewsIntroMetadata} from "../families/news-intro/calculateMetadata";
import {NewsIntroComposition} from "../families/news-intro/NewsIntroComposition";
import {getFamilyPreviewWorkspaceId, templateRegistry} from "../registry/templateRegistry";

const familyComponents: Record<string, React.ComponentType<any>> = {
  "news-anchor": NewsAnchorComposition,
  "news-intro": NewsIntroComposition,
  "audio-showcase": AudioShowcaseComposition,
  "audio-karaoke": AudioKaraokeComposition,
};

const familyMetadataCalculators: Record<string, typeof calculateNewsAnchorMetadata> = {
  "news-anchor": calculateNewsAnchorMetadata,
  "news-intro": calculateNewsIntroMetadata,
  "audio-showcase": calculateAudioShowcaseMetadata,
  "audio-karaoke": calculateAudioKaraokeMetadata,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {templateRegistry.families.map((family) => {
        const component = familyComponents[family.id];
        const calculateMetadata = familyMetadataCalculators[family.id];
        if (!component || !calculateMetadata) {
          return null;
        }

        return (
          <Composition
            key={family.id}
            id={family.compositionId}
            component={component}
            schema={workspaceCompositionSchema}
            calculateMetadata={calculateMetadata}
            width={1080}
            height={1920}
            fps={30}
            durationInFrames={300}
            defaultProps={{
              workspaceId: getFamilyPreviewWorkspaceId(family.id),
              apiBaseUrl: "http://127.0.0.1:6901",
            }}
          />
        );
      })}
    </>
  );
};
