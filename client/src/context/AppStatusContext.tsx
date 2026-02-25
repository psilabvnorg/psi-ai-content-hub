import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { APP_API_URL } from "@/lib/api";
import { useManagedServices } from "@/hooks/useManagedServices";

type ToolsStatus = {
  ffmpeg?: { installed: boolean };
  yt_dlp?: { installed: boolean };
};

type AppStatusState = {
  /** True when the app server is reachable */
  serverReachable: boolean;
  /** True when server is reachable but one or more required deps are missing */
  hasMissingDeps: boolean;
  /** List of missing dep names for display */
  missingDeps: string[];
};

const AppStatusContext = createContext<AppStatusState>({
  serverReachable: false,
  hasMissingDeps: false,
  missingDeps: [],
});

const POLL_INTERVAL_MS = 30_000;

export function AppStatusProvider({ children }: { children: ReactNode }) {
  const [serverReachable, setServerReachable] = useState(false);
  const [toolsStatus, setToolsStatus] = useState<ToolsStatus | null>(null);
  const [envAllInstalled, setEnvAllInstalled] = useState<boolean | null>(null);
  const [modelsReady, setModelsReady] = useState<boolean | null>(null);
  const { servicesById } = useManagedServices();
  const appServiceStatus = servicesById.app?.status;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = async () => {
    // 1. Ping server
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/status`);
      setServerReachable(res.ok);
      if (!res.ok) return;
    } catch {
      setServerReachable(false);
      return;
    }

    // 2. Tools status (ffmpeg, yt-dlp)
    try {
      const res = await fetch(`${APP_API_URL}/api/v1/tools/status`);
      if (res.ok) setToolsStatus((await res.json()) as ToolsStatus);
    } catch {
      // leave stale value
    }

    // 3. Env profiles — a quick check: all 4 profiles installed?
    try {
      const [whisper, translation, imageFinder, bgRemove] = await Promise.all([
        fetch(`${APP_API_URL}/api/v1/env/profiles/whisper/status`),
        fetch(`${APP_API_URL}/api/v1/env/profiles/translation/status`),
        fetch(`${APP_API_URL}/api/v1/env/profiles/image-search/status`),
        fetch(`${APP_API_URL}/api/v1/env/profiles/bg-remove-overlay/status`),
      ]);
      const jsons = await Promise.all(
        [whisper, translation, imageFinder, bgRemove].map((r) =>
          r.ok ? (r.json() as Promise<{ installed?: boolean; profile_status?: { installed?: boolean } }>) : Promise.resolve(null)
        )
      );
      const allInstalled = jsons.every((j) => {
        if (!j) return false;
        if ("profile_status" in j) return j.profile_status?.installed === true;
        return j.installed === true;
      });
      setEnvAllInstalled(allInstalled);
    } catch {
      // leave stale value
    }

    // 4. Model readiness
    try {
      const [whisperRes, translationRes, bgRemoveRes] = await Promise.all([
        fetch(`${APP_API_URL}/api/v1/whisper/status`),
        fetch(`${APP_API_URL}/api/v1/translation/status`),
        fetch(`${APP_API_URL}/api/v1/bg-remove-overlay/status`),
      ]);
      const whisperData = whisperRes.ok ? ((await whisperRes.json()) as { models?: { whisper?: { cached_models?: string[] } } }) : null;
      const translationData = translationRes.ok ? ((await translationRes.json()) as { loaded?: boolean; downloaded?: boolean }) : null;
      const bgData = bgRemoveRes.ok ? ((await bgRemoveRes.json()) as { models?: { background_removal?: { model_loaded?: boolean; model_downloaded?: boolean } } }) : null;
      const whisperReady = Boolean(whisperData?.models?.whisper?.cached_models?.length);
      const translationReady = Boolean(translationData?.loaded || translationData?.downloaded);
      const bgReady = Boolean(bgData?.models?.background_removal?.model_loaded || bgData?.models?.background_removal?.model_downloaded);
      setModelsReady(whisperReady && translationReady && bgReady);
    } catch {
      // leave stale value
    }
  };

  // Refetch whenever app service status changes
  useEffect(() => {
    if (appServiceStatus === "running" || appServiceStatus === "stopped") {
      void fetchAll();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appServiceStatus]);

  // Poll every 30s
  useEffect(() => {
    void fetchAll();
    timerRef.current = setInterval(() => void fetchAll(), POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const missingDeps: string[] = [];
  if (serverReachable) {
    if (!toolsStatus?.ffmpeg?.installed) missingDeps.push("ffmpeg");
    if (!toolsStatus?.yt_dlp?.installed) missingDeps.push("yt-dlp");
    if (envAllInstalled === false) missingDeps.push("env profiles");
    if (modelsReady === false) missingDeps.push("ML models");
  }

  return (
    <AppStatusContext.Provider
      value={{
        serverReachable,
        hasMissingDeps: serverReachable && missingDeps.length > 0,
        missingDeps,
      }}
    >
      {children}
    </AppStatusContext.Provider>
  );
}

export function useAppStatus(): AppStatusState {
  return useContext(AppStatusContext);
}
