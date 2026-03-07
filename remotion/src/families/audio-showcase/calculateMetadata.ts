import type {CalculateMetadataFunction} from "remotion";
import {z} from "zod";

import type {WorkspaceCompositionProps} from "../../core/workspace/baseSchema";
import {loadWorkspaceManifest} from "../../core/workspace/loadWorkspaceManifest";
import {getAudioDuration} from "../../utils/getAudioDuration";

export const audioShowcaseResolvedPropsSchema = z.object({
  isPlaceholder: z.boolean().default(false),
  placeholderTitle: z.string().default("Stage a preview from the desktop app to inspect this family."),
  contentDirectory: z.string().default(""),
  orientation: z.enum(["vertical", "horizontal"]).default("vertical"),
  audioFiles: z.array(z.string()).default([]),
  audioDurationsInFrames: z.array(z.number()).default([]),
  images: z.array(z.string()).default([]),
  imageDurationInFrames: z.number().default(300),
  artistName: z.string().default(""),
  accentColor: z.string().default("#A855F7"),
  waveformStyle: z.enum(["bars", "wave"]).default("bars"),
  numberOfBars: z.number().default(64),
  title: z.string().default(""),
  heroImage: z.string().default(""),
  textBackgroundColor: z.string().default("#000000"),
  textBackgroundOpacity: z.number().default(0.45),
  trackCaptions: z.array(z.array(z.any())).default([]),
});

export type AudioShowcaseResolvedProps = z.infer<typeof audioShowcaseResolvedPropsSchema>;

const placeholderProps: AudioShowcaseResolvedProps = audioShowcaseResolvedPropsSchema.parse({
  isPlaceholder: true,
});

export const calculateAudioShowcaseMetadata: CalculateMetadataFunction<WorkspaceCompositionProps> = async ({
  props,
  abortSignal,
}) => {
  const manifest = await loadWorkspaceManifest<AudioShowcaseResolvedProps>({
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

  const resolved = audioShowcaseResolvedPropsSchema.parse(manifest.inputProps);
  const audioDurationsInFrames = resolved.audioDurationsInFrames.length > 0
    ? resolved.audioDurationsInFrames
    : await Promise.all(
      resolved.audioFiles.map(async (src) => Math.ceil((await getAudioDuration(src)) * manifest.fps)),
    );
  const durationInFrames = audioDurationsInFrames.reduce((sum, frames) => sum + frames, 0) || 300;

  return {
    fps: manifest.fps,
    width: manifest.width,
    height: manifest.height,
    durationInFrames,
    props: {
      ...resolved,
      audioDurationsInFrames,
    },
  };
};
