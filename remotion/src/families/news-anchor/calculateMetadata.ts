import type {CalculateMetadataFunction} from "remotion";

import type {WorkspaceCompositionProps} from "../../core/workspace/baseSchema";
import {loadWorkspaceManifest} from "../../core/workspace/loadWorkspaceManifest";
import {getAudioDuration} from "../../utils/getAudioDuration";
import {newsAnchorResolvedPropsSchema, type NewsAnchorResolvedProps} from "./schema";

const placeholderProps: NewsAnchorResolvedProps = newsAnchorResolvedPropsSchema.parse({
  isPlaceholder: true,
});

export const calculateNewsAnchorMetadata: CalculateMetadataFunction<WorkspaceCompositionProps> = async ({
  props,
  abortSignal,
}) => {
  const manifest = await loadWorkspaceManifest<NewsAnchorResolvedProps>({
    workspaceId: props.workspaceId,
    apiBaseUrl: props.apiBaseUrl,
    abortSignal,
  });

  if (!manifest) {
    return {
      fps: 30,
      width: 1080,
      height: 1920,
      durationInFrames: 300,
      props: placeholderProps,
    };
  }

  const resolvedProps = newsAnchorResolvedPropsSchema.parse(manifest.inputProps);
  const audioDuration = resolvedProps.audioSrc ? await getAudioDuration(resolvedProps.audioSrc) : 10;
  const durationInFrames = Math.max(Math.ceil(audioDuration * manifest.fps), manifest.durationInFrames ?? 1);

  return {
    fps: manifest.fps,
    width: manifest.width,
    height: manifest.height,
    durationInFrames,
    props: resolvedProps,
  };
};
