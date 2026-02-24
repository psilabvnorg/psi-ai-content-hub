/**
 * Shared types for tool components
 */

export type EnvStatus = {
  installed: boolean;
  missing?: string[];
  installed_modules?: string[];
  python_path?: string;
};

export type ProgressData = {
  status: string;
  percent: number;
  message?: string;
  logs?: string[];
  file_path?: string;
  filename?: string;
  duration?: number;
  sample_rate?: number;
};

export type StatusRowConfig = {
  id: string;
  label: string;
  isReady: boolean;
  /** True when downloaded but not loaded into memory — shows amber Sleep state */
  isSleeping?: boolean;
  path?: string;
  showActionButton?: boolean;
  actionButtonLabel?: string;
  actionDisabled?: boolean;
  actionLoading?: boolean;
  onAction?: () => void;
  showSecondaryAction?: boolean;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
};

export type ServiceStatusConfig = {
  serverUnreachable: boolean;
  /** True when server is reachable but dependencies are missing — shows a yellow warning icon */
  serverWarning?: boolean;
  /** Called when user clicks "Open Settings" button shown alongside the warning icon */
  onOpenSettings?: () => void;
  rows: StatusRowConfig[];
  onRefresh: () => void;
  onServerToggle?: () => void;
  isServerStarting?: boolean;
};
