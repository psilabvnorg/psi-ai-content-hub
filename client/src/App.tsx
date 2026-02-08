import { Switch, Route, Router as WouterRouter } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useState } from "react";
import Home from "@/pages/Home";
import FeaturePlaceholder from "@/pages/FeaturePlaceholder";
import NotFound from "@/pages/not-found";
import { LanguageProvider } from "@/i18n/i18n";

// Check if running in Electron - file:// protocol indicates desktop shell
const isElectron = typeof window !== "undefined" && window.location.protocol === "file:";

function AppRouter() {
  const [activeFeature, setActiveFeature] = useState<string | null>(null);

  if (activeFeature) {
    return <FeaturePlaceholder id={activeFeature} onBack={() => setActiveFeature(null)} />;
  }

  return (
    <Switch>
      <Route path="/">
        <Home onSelectFeature={(id) => setActiveFeature(id)} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <WouterRouter hook={isElectron ? useHashLocation : undefined}>
          <AppRouter />
        </WouterRouter>
        <Toaster />
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
