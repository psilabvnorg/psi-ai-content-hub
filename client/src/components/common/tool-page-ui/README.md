# Tool Page UI Components

Reusable components and utilities for building tool pages with consistent UI patterns.

## Components

### ServiceStatusTable

Displays a status table with server connectivity, environment, and custom status rows.

**Props:**
- `apiUrl: string` - The API endpoint URL to display
- `serverUnreachable: boolean` - Whether the server is unreachable
- `rows: StatusRowConfig[]` - Array of status row configurations
- `onRefresh: () => void` - Callback when refresh button is clicked

**Example:**
```tsx
import { ServiceStatusTable } from "@/components/common/tool-page-ui";

<ServiceStatusTable
  apiUrl={VIENEU_API_URL}
  serverUnreachable={serverUnreachable}
  rows={[
    {
      id: "server",
      label: t("tool.tts_fast.server_status"),
      isReady: !serverUnreachable,
      onAction: onOpenSettings,
    },
    {
      id: "env",
      label: t("tool.tts_fast.env_status"),
      isReady: status?.env?.installed === true,
      path: status?.env?.installed_modules?.join(", ") || "--",
      showActionButton: !status?.env?.installed,
      actionButtonLabel: t("tool.common.install_library"),
      onAction: onOpenSettings,
    },
  ]}
  onRefresh={fetchStatus}
/>
```

### ProgressDisplay

Shows progress bar with percentage and optional log output.

**Props:**
- `progress: ProgressData | null` - Progress data object
- `logs: string[]` - Array of log messages
- `defaultMessage?: string` - Default message when progress.message is empty

**Example:**
```tsx
import { ProgressDisplay } from "@/components/common/tool-page-ui";

<ProgressDisplay
  progress={progress}
  logs={logs}
  defaultMessage={t("tool.tts_fast.processing")}
/>
```

### AudioResult

Displays audio player with download button and optional duration.

**Props:**
- `audioUrl: string | null` - URL of the audio file
- `downloadName?: string | null` - Filename for download
- `duration?: number | null` - Audio duration in seconds
- `onDownload: () => void` - Download button click handler
- `readyMessage?: string` - Custom ready message
- `durationMessage?: string` - Custom duration message

**Example:**
```tsx
import { AudioResult } from "@/components/common/tool-page-ui";

<AudioResult
  audioUrl={audioUrl}
  downloadName={downloadName}
  duration={audioDuration}
  onDownload={handleDownload}
  readyMessage={t("tool.tts_fast.audio_ready")}
/>
```

## Hooks

### useToolStatus

Manages status fetching from environment and status endpoints.

**Parameters:**
- `endpoints: { envUrl: string; statusUrl: string }` - API endpoints

**Returns:**
- `status: StatusResponse<T> | null` - Status data
- `isLoading: boolean` - Loading state
- `fetchStatus: () => Promise<void>` - Function to fetch status
- `serverUnreachable: boolean` - Computed server unreachable flag
- `envReady: boolean` - Computed environment ready flag

**Example:**
```tsx
import { useToolStatus } from "@/components/common/tool-page-ui";

const { status, fetchStatus, serverUnreachable, envReady } = useToolStatus({
  envUrl: `${VIENEU_API_URL}/api/v1/env/status`,
  statusUrl: `${VIENEU_API_URL}/api/v1/status`,
});

useEffect(() => {
  fetchStatus();
}, [fetchStatus]);
```

## Types

### EnvStatus
```typescript
type EnvStatus = {
  installed: boolean;
  missing?: string[];
  installed_modules?: string[];
  python_path?: string;
};
```

### ProgressData
```typescript
type ProgressData = {
  status: string;
  percent: number;
  message?: string;
  logs?: string[];
  file_path?: string;
  filename?: string;
  duration?: number;
  sample_rate?: number;
};
```

### StatusRowConfig
```typescript
type StatusRowConfig = {
  id: string;
  label: string;
  isReady: boolean;
  path?: string;
  showActionButton?: boolean;
  actionButtonLabel?: string;
  onAction?: () => void;
};
```

## Migration Guide

### Before (Duplicated Code)
```tsx
// Status table repeated in every tool
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <h3>{t("tool.tts_fast.service_status")}</h3>
    <Button onClick={fetchStatus}>
      <RefreshCw />
    </Button>
  </div>
  <Table>
    {/* 50+ lines of table code */}
  </Table>
</div>

// Progress display repeated
{progress && (
  <div className="w-full p-4 bg-accent/12...">
    {/* 30+ lines of progress code */}
  </div>
)}
```

### After (Reusable Components)
```tsx
import { ServiceStatusTable, ProgressDisplay, AudioResult } from "@/components/common/tool-page-ui";

<ServiceStatusTable {...statusConfig} />
<ProgressDisplay progress={progress} logs={logs} />
<AudioResult audioUrl={audioUrl} onDownload={handleDownload} />
```

## Benefits

1. **Code Reduction**: ~70% less code per tool page
2. **Consistency**: Uniform UI/UX across all tools
3. **Maintainability**: Single source of truth for common patterns
4. **Type Safety**: Shared TypeScript types
5. **Flexibility**: Configurable via props for tool-specific needs
