import { useCallback, useEffect, useMemo, useState } from "react";

export type ManagedServiceId = "app" | "f5" | "vieneu" | "whisper" | "bgremove";
export type ManagedServiceStatusState =
  | "not_configured"
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

export type ManagedServiceStatus = {
  id: string;
  name: string;
  status: ManagedServiceStatusState;
  pid: number | null;
  error: string | null;
  api_url: string;
  health_url: string;
  service_root: string;
  venv_python_path: string;
  configured: boolean;
  updated_at: string;
};

function hasManagedServicesApi() {
  return typeof window !== "undefined" && typeof window.electronAPI?.services?.list === "function";
}

export function useManagedServices() {
  const [services, setServices] = useState<ManagedServiceStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [actioningById, setActioningById] = useState<Record<string, boolean>>({});

  const supported = hasManagedServicesApi();

  const refresh = useCallback(async () => {
    if (!supported || !window.electronAPI) return;
    setLoading(true);
    try {
      const next = await window.electronAPI.services.list();
      setServices(next);
    } finally {
      setLoading(false);
    }
  }, [supported]);

  const runAction = useCallback(
    async (serviceId: string, action: (id: string) => Promise<ManagedServiceStatus>) => {
      if (!supported || !window.electronAPI) return;

      setActioningById((prev) => ({ ...prev, [serviceId]: true }));
      try {
        await action(serviceId);
        const next = await window.electronAPI.services.list();
        setServices(next);
      } finally {
        setActioningById((prev) => ({ ...prev, [serviceId]: false }));
      }
    },
    [supported]
  );

  const start = useCallback(
    async (serviceId: ManagedServiceId) => {
      await runAction(serviceId, async (id) => {
        if (!window.electronAPI) {
          throw new Error("Electron services API unavailable");
        }
        return window.electronAPI.services.start(id);
      });
    },
    [runAction]
  );

  const stop = useCallback(
    async (serviceId: ManagedServiceId) => {
      await runAction(serviceId, async (id) => {
        if (!window.electronAPI) {
          throw new Error("Electron services API unavailable");
        }
        return window.electronAPI.services.stop(id);
      });
    },
    [runAction]
  );

  const restart = useCallback(
    async (serviceId: ManagedServiceId) => {
      await runAction(serviceId, async (id) => {
        if (!window.electronAPI) {
          throw new Error("Electron services API unavailable");
        }
        return window.electronAPI.services.restart(id);
      });
    },
    [runAction]
  );

  useEffect(() => {
    if (!supported || !window.electronAPI) return;

    let active = true;
    setLoading(true);
    window.electronAPI.services
      .list()
      .then((next) => {
        if (active) {
          setServices(next);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    const unsubscribe = window.electronAPI.services.onStatusChanged((next) => {
      if (active) {
        setServices(next);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [supported]);

  const servicesById = useMemo<Record<string, ManagedServiceStatus>>(
    () =>
      services.reduce<Record<string, ManagedServiceStatus>>((acc, service) => {
        acc[service.id] = service;
        return acc;
      }, {}),
    [services]
  );

  const isBusy = useCallback(
    (serviceId: ManagedServiceId) => {
      const runtimeStatus = servicesById[serviceId]?.status;
      return actioningById[serviceId] === true || runtimeStatus === "starting" || runtimeStatus === "stopping";
    },
    [actioningById, servicesById]
  );

  return {
    supported,
    loading,
    services,
    servicesById,
    refresh,
    start,
    stop,
    restart,
    isBusy,
  };
}
