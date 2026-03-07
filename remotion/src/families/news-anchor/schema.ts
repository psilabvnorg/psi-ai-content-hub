import {z} from "zod";

export const newsAnchorResolvedPropsSchema = z.object({
  isPlaceholder: z.boolean().default(false),
  placeholderTitle: z.string().default("Stage a preview from the desktop app to inspect this family."),
  variant: z.enum(["background", "clean", "cnn"]).default("background"),
  orientation: z.enum(["vertical", "horizontal"]).default("vertical"),
  backgroundMode: z.boolean().default(false),
  introDurationInFrames: z.number().default(150),
  imageDurationInFrames: z.number().default(170),
  captionBottomPercent: z.number().default(20),
  introProps: z.object({
    image1: z.string().default(""),
    image2: z.string().default(""),
    heroImage: z.string().default(""),
  }).default({
    image1: "",
    image2: "",
    heroImage: "",
  }),
  images: z.array(z.string()).default([]),
  videos: z.array(z.string()).default([]),
  videoDurations: z.array(z.number()).default([]),
  audioSrc: z.string().optional(),
  captions: z.array(z.any()).default([]),
  sections: z.array(z.object({title: z.string(), startMs: z.number()})).default([]),
  overlayImage: z.string().default(""),
  backgroundOverlayImage: z.string().default(""),
  heroOverlayImage: z.string().nullable().optional(),
});

export type NewsAnchorResolvedProps = z.infer<typeof newsAnchorResolvedPropsSchema>;
