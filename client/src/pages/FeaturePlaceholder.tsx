import { Button } from "@/components/ui/button";
import { ChevronLeft, Wand2, ArrowRight } from "lucide-react";

export default function FeaturePlaceholder({ 
  id, 
  onBack 
}: { 
  id: string, 
  onBack: () => void 
}) {
  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a] p-6 flex flex-col">
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between mb-12">
        <Button 
          variant="ghost" 
          onClick={onBack}
          className="group hover:bg-zinc-100 dark:hover:bg-zinc-800"
          data-testid="button-back"
        >
          <ChevronLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
          Back to Dashboard
        </Button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg dark:text-white">AI Studio</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center max-w-2xl mx-auto">
        <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/20 rounded-3xl flex items-center justify-center mb-8 animate-pulse">
           <Wand2 className="w-10 h-10 text-blue-600" />
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-zinc-900 dark:text-white mb-4 tracking-tight">
          {id.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
        </h1>
        <p className="text-lg text-zinc-500 dark:text-zinc-400 mb-10 leading-relaxed">
          The AI engine is preparing the environment for your creative session. 
          This feature will allow you to transform your ideas into professional assets instantly.
        </p>
        
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 text-left mb-12">
          {[
            "High-quality 4K output generation",
            "Multi-language support (60+ languages)",
            "Custom voice & style presets",
            "Direct export to social platforms"
          ].map((feature, i) => (
            <div key={i} className="flex items-center gap-3 p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm">
              <div className="w-2 h-2 bg-blue-600 rounded-full" />
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{feature}</span>
            </div>
          ))}
        </div>

        <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-8 h-12 text-base font-bold shadow-lg shadow-blue-500/20">
          Get Started
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </main>

      <footer className="max-w-4xl mx-auto w-full py-8 text-center border-t border-zinc-200 dark:border-zinc-800 mt-auto">
        <p className="text-xs text-zinc-400 dark:text-zinc-500">© 2026 AI Content Studio. All rights reserved.</p>
      </footer>
    </div>
  );
}
