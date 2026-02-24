import { Switch, Route, Router as WouterRouter } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useState } from "react";
import Home from "@/pages/Home";
import FeaturePlaceholder from "@/pages/FeaturePlaceholder";
import NotFound from "@/pages/not-found";
import { LanguageProvider, useI18n } from "@/i18n/i18n";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Settings } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { AppStatusProvider } from "@/context/AppStatusContext";

// Check if running in Electron - file:// protocol indicates desktop shell
const isElectron = typeof window !== "undefined" && window.location.protocol === "file:";

function AppRouter() {
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const { t } = useI18n();

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-border bg-background/90 px-6 backdrop-blur-md">
        <div className="flex h-full items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandLogo label={t("app.name")} imageClassName="h-9 border-white/15 bg-black" />
            {activeFeature !== null && (
              <Button
                variant="ghost"
                size="lg"
                onClick={() => setActiveFeature(null)}
                className="text-base [&_svg]:size-6 font-semibold"
              >
                <ChevronLeft className="mr-1" />
                {t("home.back_dashboard")}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeFeature !== null && (
              <Button
                variant="ghost"
                size="lg"
                onClick={() => setActiveFeature(null)}
                className="text-base [&_svg]:size-6 font-semibold"
                data-testid="button-back"
              >
                <ChevronLeft className="mr-1" />
                {t("home.back_dashboard")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setActiveFeature("settings")}
              data-testid="button-settings"
              className="text-base [&_svg]:size-6"
            >
              <Settings className="mr-2" />
              {t("nav.settings")}
            </Button>
          </div>
        </div>
      </header>

      {activeFeature ? (
        <FeaturePlaceholder
          id={activeFeature}
          onBack={() => setActiveFeature(null)}
          onSelectFeature={setActiveFeature}
        />
      ) : (
        <Switch>
          <Route path="/">
            <Home onSelectFeature={(id) => setActiveFeature(id)} />
          </Route>
          <Route component={NotFound} />
        </Switch>
      )}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AppStatusProvider>
          <WouterRouter hook={isElectron ? useHashLocation : undefined}>
            <AppRouter />
          </WouterRouter>
          <Toaster />
        </AppStatusProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
