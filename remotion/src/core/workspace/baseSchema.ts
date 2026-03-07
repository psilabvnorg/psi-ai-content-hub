import {z} from "zod";

export const workspaceCompositionSchema = z.object({
  workspaceId: z.string().default(""),
  apiBaseUrl: z.string().default("http://127.0.0.1:6901"),
});

export type WorkspaceCompositionProps = z.infer<typeof workspaceCompositionSchema>;
