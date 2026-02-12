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
  path?: string;
  showActionButton?: boolean;
  actionButtonLabel?: string;
  onAction?: () => void;
};

export type ServiceStatusConfig = {
  apiUrl: string;
  serverUnreachable: boolean;
  rows: StatusRowConfig[];
  onRefresh: () => void;
};
