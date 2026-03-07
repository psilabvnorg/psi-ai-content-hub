import type {CalculateMetadataFunction} from "remotion";
import {z} from "zod";

import type {WorkspaceCompositionProps} from "../../core/workspace/baseSchema";
import {loadWorkspaceManifest} from "../../core/workspace/loadWorkspaceManifest";

export const newsIntroResolvedPropsSchema = z.object({
  isPlaceholder: z.boolean().default(false),
  placeholderTitle: z.string().default("Stage a preview from the desktop app to inspect this family."),
  orientation: z.enum(["vertical", "horizontal"]).default("vertical"),
  introDurationInFrames: z.number().default(150),
  introProps: z.object({
    image1: z.string().default(""),
    image2: z.string().default(""),
    heroImage: z.string().default(""),
  }).default({
    image1: "",
    image2: "",
    heroImage: "",
  }),
});

export type NewsIntroResolvedProps = z.infer<typeof newsIntroResolvedPropsSchema>;

const placeholderProps: NewsIntroResolvedProps = newsIntroResolvedPropsSchema.parse({
  isPlaceholder: true,
});

export const calculateNewsIntroMetadata: CalculateMetadataFunction<WorkspaceCompositionProps> = async ({
  props,
  abortSignal,
}) => {
  const manifest = await loadWorkspaceManifest<NewsIntroResolvedProps>({
    workspaceId: props.workspaceId,
    apiBaseUrl: props.apiBaseUrl,
    abortSignal,
  });

  if (!manifest) {
    return {
      fps: 30,
      width: 1080,
      height: 1920,
      durationInFrames: 150,
      props: placeholderProps,
    };
  }

  return {
    fps: manifest.fps,
    width: manifest.width,
    height: manifest.height,
    durationInFrames: manifest.durationInFrames ?? 150,
    props: newsIntroResolvedPropsSchema.parse(manifest.inputProps),
  };
};
