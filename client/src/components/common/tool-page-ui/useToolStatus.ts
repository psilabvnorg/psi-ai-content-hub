import { useState, useCallback } from "react";
import type { EnvStatus } from "./types";

type StatusEndpoints = {
  envUrl: string;
  statusUrl: string;
};

type StatusResponse<T = unknown> = {
  server_unreachable: boolean;
  env?: EnvStatus;
  data?: T;
};

export function useToolStatus<T = unknown>(endpoints: StatusEndpoints) {
  const [status, setStatus] = useState<StatusResponse<T> | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const [envRes, statusRes] = await Promise.all([
        fetch(endpoints.envUrl),
        fetch(endpoints.statusUrl),
      ]);

      if (!envRes.ok || !statusRes.ok) {
        throw new Error("status");
      }

      const envData = (await envRes.json()) as EnvStatus;
      const statusData = (await statusRes.json()) as T;

      setStatus({
        server_unreachable: false,
        env: envData,
        data: statusData,
      });
    } catch {
      setStatus({ server_unreachable: true });
    } finally {
      setIsLoading(false);
    }
  }, [endpoints.envUrl, endpoints.statusUrl]);

  return {
    status,
    isLoading,
    fetchStatus,
    serverUnreachable: status?.server_unreachable === true,
    envReady: status?.env?.installed === true,
  };
}
