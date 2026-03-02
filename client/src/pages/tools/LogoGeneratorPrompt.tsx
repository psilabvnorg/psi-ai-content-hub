import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy } from "lucide-react";

export default function LogoPromptGenerator() {
  const [category, setCategory] = useState("general");
  const [template, setTemplate] = useState("");
  const [text, setText] = useState("");

  // ---------- 20+ Logo Templates ----------
  const templates: Record<string, string> = {
    starbucks: `Create a Starbucks-style circular emblem logo featuring a central icon similar to a mermaid silhouette (without copying the original). Replace the text with "{{USER_TEXT}}". Use green-white tones and a clean badge layout.`,
    pornhub: `Create a Pornhub-style split-color rectangular logo. Use black on the left and an accent color on the right. Bold modern font. Replace text with "{{USER_TEXT}}".`,
    onlyfans: `Create an OnlyFans-inspired logo with flowing script and soft blue gradients. Use a keyhole-like circular icon (modified). Replace text with "{{USER_TEXT}}".`,
    x: `Create a minimal black-and-white X-style futuristic logo, but using "{{USER_TEXT}}" as the base letter or symbol. Keep geometric sharpness.`,
    facebook: `Create a Facebook-style rounded-square badge but replace the symbol with a stylized "{{USER_TEXT}}". Use custom blue shade.`,
    youtube: `Create a YouTube-style logo with a rounded play-button shape. Replace the label with "{{USER_TEXT}}". Red-white theme with custom shade.`,
    netflix: `Create a Netflix-inspired cinematic logo with bold tall letters. Use a red-black gradient and replace with "{{USER_TEXT}}".`,
    discord: `Create a Discord-style playful bubble icon but modified. Replace all text with "{{USER_TEXT}}". Purple/blue palette.`,
    instagram: `Create an Instagram-style gradient rounded-square background that fades multi-color. Iconography themed but text replaced with "{{USER_TEXT}}".`,
    twitch: `Create a Twitch-inspired blocky streaming logo with stylized chat bubble shapes. Replace the title with "{{USER_TEXT}}".`,
    coca: `Create a Coca-Cola–inspired flowing script logo using a custom red-white palette. Replace the calligraphy with "{{USER_TEXT}}".`,
    nike: `Create a Nike-inspired energetic sports logo using a stylized swoosh variation and the word "{{USER_TEXT}}". Minimal and bold.`,
    adidas: `Create an Adidas-style geometric logo with angled stripes (modified) and the label "{{USER_TEXT}}". Black-white theme.`,
    marvel: `Create a Marvel-style bold block logo with dramatic comic-book intensity. Replace text with "{{USER_TEXT}}".`,
    dc: `Create a DC-style heroic circular emblem with metallic tones and "{{USER_TEXT}}" as the central symbol.`,
    disney: `Create a Disney-style whimsical handwritten logo with curved magical strokes. Replace signature text with "{{USER_TEXT}}".`,
    pixar: `Create a Pixar-style clean spaced typography logo with cinematic humility. Replace label with "{{USER_TEXT}}".`,
    spotify: `Create a Spotify-style circular wave icon with modified curves. Use green-black theme. Replace text with "{{USER_TEXT}}".`,
    paypal: `Create a PayPal-style layered P-shaped symbol but modified. Replace branding text with "{{USER_TEXT}}". Blue gradients.`,
    reddit: `Create a Reddit-inspired friendly mascot outline (not identical) and bold text "{{USER_TEXT}}". Use orange/white theme.`,
    github: `Create a GitHub-inspired circular mascot silhouette (generic) with "{{USER_TEXT}}" as branding. Monochrome theme.`,
  };

  const categories = ["general", "sport", "entertainment", "news", "social", "gaming", "tech", "minimalist"];

  const promptOutput = useMemo(() => {
    if (!template || !text) return "";
    return templates[template].replace("{{USER_TEXT}}", text);
  }, [template, text]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(promptOutput);
  };

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-8">

        <h1 className="text-2xl font-bold">Logo Prompt Generator</h1>

        {/* Category */}
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Category
          </label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Pick category" /></SelectTrigger>
            <SelectContent>
              {categories.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Template Selector */}
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Logo Template
          </label>
          <Select value={template} onValueChange={setTemplate}>
            <SelectTrigger><SelectValue placeholder="Pick logo style" /></SelectTrigger>
            <SelectContent>
              {Object.keys(templates).map(key => (
                <SelectItem key={key} value={key}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Text Input */}
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Your Logo Text
          </label>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your brand name"
            className="h-12 rounded-xl"
          />
        </div>

        {/* Output */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Generated Prompt
          </label>
          <Textarea
            value={promptOutput}
            readOnly
            placeholder="Your generated prompt will appear here"
            className="min-h-[160px] rounded-xl"
          />
        </div>

        {/* Copy Button */}
        <Button
          className="w-full h-12 rounded-xl font-bold flex items-center gap-2"
          disabled={!promptOutput}
          onClick={copyToClipboard}
        >
          <Copy className="w-4 h-4" />
          Copy Prompt
        </Button>
      </CardContent>
    </Card>
  );
}