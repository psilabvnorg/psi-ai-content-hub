import type {WorkspaceCompositionProps} from "./baseSchema";

export type WorkspaceManifest<TProps = Record<string, unknown>> = {
  workspaceId: string;
  mode: string;
  presetId: string;
  familyId: string;
  compositionId: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames?: number;
  inputProps: TProps;
  createdAt: number;
};

export const loadWorkspaceManifest = async <TProps>({
  workspaceId,
  apiBaseUrl,
  abortSignal,
}: WorkspaceCompositionProps & {abortSignal?: AbortSignal}): Promise<WorkspaceManifest<TProps> | null> => {
  const response = await fetch(
    `${apiBaseUrl}/api/v1/workspaces/${encodeURIComponent(workspaceId)}/manifest`,
    {
      cache: "no-store",
      signal: abortSignal,
    },
  );

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`Workspace manifest request failed: ${response.status}`);
  }

  return (await response.json()) as WorkspaceManifest<TProps>;
};
