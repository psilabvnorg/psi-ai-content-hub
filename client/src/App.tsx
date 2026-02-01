import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useState } from "react";
import Home from "@/pages/Home";
import FeaturePlaceholder from "@/pages/FeaturePlaceholder";
import NotFound from "@/pages/not-found";

function Router() {
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
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
