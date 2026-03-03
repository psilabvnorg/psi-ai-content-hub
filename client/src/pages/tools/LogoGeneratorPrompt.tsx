import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, ExternalLink } from "lucide-react";

type TemplateEntry = { category: string; prompt: string };

export default function LogoPromptGenerator() {
  const [category, setCategory] = useState("social");
  const [template, setTemplate] = useState("");
  const [text, setText] = useState("");

  // ---------- Logo Templates with category mapping ----------
  const templates: Record<string, TemplateEntry> = {
    // general (8)
    starbucks:    { category: "general", prompt: `Design a circular emblem reminiscent of Starbucks. DO use a mermaid-like central figure and green–white tones. DON’T copy the original artwork or exact shapes. Replace all text with "{{USER_TEXT}}".` },
    coca:         { category: "general", prompt: `Design a flowing script mark inspired by Coca-Cola. DO use smooth curves and a red–white palette. DON’T copy the exact letterforms. Insert "{{USER_TEXT}}".` },
    mcdonalds:    { category: "general", prompt: `Design a logo influenced by McDonald's. DO create a bold arch-like symbol and use red with golden tones. DON’T recreate the exact M. Replace text with "{{USER_TEXT}}".` },
    ikea:         { category: "general", prompt: `Design a rectangular badge referencing IKEA. DO apply blue–yellow color blocks and bold type. DON’T copy their shapes exactly. Use "{{USER_TEXT}}".` },
    amazon:       { category: "general", prompt: `Design a wordmark reminiscent of Amazon. DO add a curved arrow-smile beneath the text and use orange–black tones. DON’T copy exact proportions. Insert "{{USER_TEXT}}".` },
    lego:         { category: "general", prompt: `Design a playful badge inspired by LEGO. DO use chunky rounded letterforms, red–yellow color, and a thick outline. DON’T duplicate their exact style. Use "{{USER_TEXT}}".` },
    burger_king:  { category: "general", prompt: `Design a circular badge referencing Burger King. DO include bun-like curved shapes and warm reds/oranges. DON’T copy their arrangement. Insert "{{USER_TEXT}}".` },
    fedex:        { category: "general", prompt: `Design a wordmark influenced by FedEx. DO create a hidden arrow effect with negative space. DON’T use their exact lettering. Replace text with "{{USER_TEXT}}".` },

    // social (9)
    facebook:  { category: "social", prompt: `Design a rounded-square badge inspired by Facebook. DO use a custom blue and a simplified symbol. DON’T reuse their exact “f”. Replace with a stylized "{{USER_TEXT}}".` },
    instagram: { category: "social", prompt: `Design a gradient rounded-square icon referencing Instagram. DO use multicolor transitions and soft shapes. DON’T recreate the identical glyph. Insert "{{USER_TEXT}}".` },
    x:         { category: "social", prompt: `Design a minimal black–white geometric mark inspired by X. DO keep sharp symmetry. DON’T reproduce the exact letterform. Use "{{USER_TEXT}}".` },
    reddit:    { category: "social", prompt: `Design a friendly mascot outline influenced by Reddit. DO maintain playful simplicity. DON’T replicate their mascot. Add "{{USER_TEXT}}".` },
    discord:   { category: "social", prompt: `Design a playful bubble-style icon referencing Discord. DO use soft geometry and purple-blue tones. DON’T recreate their mascot. Replace all text with "{{USER_TEXT}}".` },
    onlyfans:  { category: "social", prompt: `Design a flowing-script layout inspired by OnlyFans. DO use soft blues and a circular lock-like symbol. DON’T copy exact calligraphy. Insert "{{USER_TEXT}}".` },
    pornhub:   { category: "social", prompt: `Design a split rectangular badge referencing Pornhub. DO use left-dark/right-accent contrast and bold type. DON’T imitate their exact typography. Use "{{USER_TEXT}}".` },
    tiktok:    { category: "social", prompt: `Design a musical-note style icon inspired by TikTok. DO apply layered cyan-red shadows. DON’T copy the original shape. Insert "{{USER_TEXT}}".` },
    snapchat:  { category: "social", prompt: `Design a ghost silhouette logo referencing Snapchat. DO keep rounded simplicity and bright yellow. DON’T match their exact outline. Add "{{USER_TEXT}}".` },

    // entertainment (7)
    youtube:   { category: "entertainment", prompt: `Design a play-button style logo inspired by YouTube. DO use a red–white theme and rounded shapes. DON’T reproduce their exact triangle. Replace label with "{{USER_TEXT}}".` },
    netflix:   { category: "entertainment", prompt: `Design a tall bold wordmark referencing Netflix. DO use red–black gradients. DON’T replicate their exact letterforms. Insert "{{USER_TEXT}}".` },
    disney:    { category: "entertainment", prompt: `Design a whimsical handwritten-style mark inspired by Disney. DO use magical curves. DON’T imitate their signature script. Add "{{USER_TEXT}}".` },
    pixar:     { category: "entertainment", prompt: `Design spaced cinematic typography referencing Pixar. DO keep clean simplicity. DON’T recreate their lamp or exact spacing. Use "{{USER_TEXT}}".` },
    marvel:    { category: "entertainment", prompt: `Design a bold block-style comic logo inspired by Marvel. DO use dramatic contrast. DON’T copy their exact box layout. Insert "{{USER_TEXT}}".` },
    dc:        { category: "entertainment", prompt: `Design a heroic circular emblem referencing DC. DO use metallic tones. DON’T replicate their monogram. Use "{{USER_TEXT}}" as the central element.` },
    spotify:   { category: "entertainment", prompt: `Design a circular wave-mark inspired by Spotify. DO use layered curved lines and green–black tones. DON’T copy their precise wave pattern. Add "{{USER_TEXT}}".` },

    // sport (8)
    nike:          { category: "sport", prompt: `Design an athletic logo influenced by Nike. DO create a dynamic swoosh-like curve. DON’T recreate the exact swoosh. Add "{{USER_TEXT}}".` },
    adidas:        { category: "sport", prompt: `Design a geometric mark referencing Adidas. DO use angled stripe forms. DON’T copy the three-stripe exact arrangement. Insert "{{USER_TEXT}}".` },
    puma:          { category: "sport", prompt: `Design a leaping-cat style sports icon inspired by Puma. DO use a sleek silhouette. DON’T mimic their cat pose. Place "{{USER_TEXT}}" below.` },
    under_armour:  { category: "sport", prompt: `Design interlocking letterforms referencing Under Armour. DO overlap strong shapes. DON’T reproduce their exact symbol. Use initials of "{{USER_TEXT}}".` },
    reebok:        { category: "sport", prompt: `Design an angular vector mark influenced by Reebok. DO use sharp diagonal geometry. DON’T copy their delta. Add "{{USER_TEXT}}".` },
    new_balance:   { category: "sport", prompt: `Design an N-focused athletic mark inspired by New Balance. DO use motion-like elements. DON’T match their stripe pattern. Include "{{USER_TEXT}}".` },
    jordan:        { category: "sport", prompt: `Design a jumping-athlete silhouette inspired by the Jordan brand. DO keep generic form and energy. DON’T recreate the Jumpman pose. Add "{{USER_TEXT}}".` },
    espn:          { category: "sport", prompt: `Design a bold broadcast-style badge referencing ESPN. DO use red–black blocks. DON’T copy their horizontal cuts. Replace text with "{{USER_TEXT}}".` },

    // gaming (8)
    twitch:      { category: "gaming", prompt: `Design a blocky streaming icon inspired by Twitch. DO use bubble/box geometry. DON’T copy the exact chat shape. Insert "{{USER_TEXT}}".` },
    steam:       { category: "gaming", prompt: `Design a circular tech emblem referencing Steam. DO include gear or vapor motifs. DON’T reuse their exact arm-joint icon. Add "{{USER_TEXT}}".` },
    playstation: { category: "gaming", prompt: `Design layered geometric shapes inspired by PlayStation. DO use the classic four-color palette. DON’T recreate their exact PS glyphs. Place "{{USER_TEXT}}".` },
    xbox:        { category: "gaming", prompt: `Design a glowing sphere logo influenced by Xbox. DO integrate a stylized X cut. DON’T copy their exact sphere geometry. Use "{{USER_TEXT}}".` },
    nintendo:    { category: "gaming", prompt: `Design an oval badge referencing Nintendo. DO use red–white tones and retro typography. DON’T mimic their exact letter shapes. Insert "{{USER_TEXT}}".` },
    epic_games:  { category: "gaming", prompt: `Design a bold angular studio badge inspired by Epic Games. DO use dark backgrounds and strong forms. DON’T duplicate their shield layout. Add "{{USER_TEXT}}".` },
    riot_games:  { category: "gaming", prompt: `Design an aggressive emblem influenced by Riot Games. DO use stylized fists or angular shapes. DON’T recreate their exact icon. Include "{{USER_TEXT}}".` },
    blizzard:    { category: "gaming", prompt: `Design an icy, storm-themed crest inspired by Blizzard. DO use ornate frost motifs. DON’T match their exact lettering. Add "{{USER_TEXT}}".` },

    // tech (8)
    github:    { category: "tech", prompt: `Design a circular mascot silhouette referencing GitHub. DO use simple outlines. DON’T replicate their Octocat. Add "{{USER_TEXT}}".` },
    paypal:    { category: "tech", prompt: `Design layered P-like shapes inspired by PayPal. DO use blue gradients. DON’T copy their exact letter stack. Insert "{{USER_TEXT}}".` },
    google:    { category: "tech", prompt: `Design a colorful wordmark referencing Google. DO use four primary colors in a clean sans-serif. DON’T imitate exact letter shapes. Replace the word with "{{USER_TEXT}}".` },
    apple:     { category: "tech", prompt: `Design a minimalist fruit silhouette inspired by Apple. DO keep a single bite-like contour. DON’T match their exact shape. Add "{{USER_TEXT}}".` },
    microsoft: { category: "tech", prompt: `Design a four-square grid referencing Microsoft. DO use red, green, blue, yellow. DON’T replicate their exact alignment. Place "{{USER_TEXT}}".` },
    intel:     { category: "tech", prompt: `Design an oval-loop style mark inspired by Intel. DO use clean blue curves. DON’T duplicate their swirl. Insert "{{USER_TEXT}}".` },
    nvidia:    { category: "tech", prompt: `Design an eye-themed mark influenced by NVIDIA. DO use vivid green accents. DON’T copy their exact symbol. Add "{{USER_TEXT}}".` },
    slack:     { category: "tech", prompt: `Design a hashtag-like pinwheel inspired by Slack. DO use four colored arms. DON’T recreate their exact arrangement. Add "{{USER_TEXT}}".` },

    // news (8)
    cnn:              { category: "news", prompt: `Design a bold broadcast badge referencing CNN. DO use red background and strong white letters. DON’T recreate their exact interlocking shapes. Replace with "{{USER_TEXT}}".` },
    bbc:              { category: "news", prompt: `Design a three-box layout inspired by BBC. DO use black–white blocks. DON’T copy their exact proportions. Fill each box with letters from "{{USER_TEXT}}".` },
    nyt:              { category: "news", prompt: `Design a serif masthead referencing the New York Times. DO use Old English/Times-like styling. DON’T imitate their exact lettering. Replace text with "{{USER_TEXT}}".` },
    fox_news:         { category: "news", prompt: `Design a diagonal split badge referencing Fox News. DO use blue–red background and bold white title. DON’T duplicate their composition. Insert "{{USER_TEXT}}".` },
    reuters:          { category: "news", prompt: `Design a dot-cluster corporate mark inspired by Reuters. DO use circular grid patterns. DON’T replicate their exact cluster. Add "{{USER_TEXT}}".` },
    the_guardian:     { category: "news", prompt: `Design a refined sans-serif masthead referencing The Guardian. DO use slim editorial styling. DON’T reuse their exact letter shapes. Insert "{{USER_TEXT}}".` },
    washington_post:  { category: "news", prompt: `Design an elegant serif wordmark inspired by The Washington Post. DO include a subtle monogram. DON’T copy their historic typeface. Use "{{USER_TEXT}}".` },
    bloomberg:        { category: "news", prompt: `Design a financial-news style mark referencing Bloomberg. DO use bold black sans-serif text. DON’T duplicate their spacing. Replace with "{{USER_TEXT}}".` },

    // minimalist (8)
    airbnb:   { category: "minimalist", prompt: `Design a minimal symbol inspired by Airbnb. DO use smooth unified shapes and coral tones. DON’T copy their exact bélo form. Add "{{USER_TEXT}}".` },
    uber:     { category: "minimalist", prompt: `Design a clean wordmark referencing Uber. DO keep minimal black typography. DON’T imitate their exact spacing. Replace text with "{{USER_TEXT}}".` },
    stripe:   { category: "minimalist", prompt: `Design a slanted S-inspired mark referencing Stripe. DO use a purple-indigo gradient. DON’T duplicate their letter angle. Include "{{USER_TEXT}}".` },
    medium:   { category: "minimalist", prompt: `Design a bold monogram inspired by Medium. DO use simple geometric fills. DON’T recreate their exact M. Replace with the initial of "{{USER_TEXT}}".` },
    figma:    { category: "minimalist", prompt: `Design a stacked rounded-square icon referencing Figma. DO use soft colorful layers. DON’T match their grid exactly. Add "{{USER_TEXT}}".` },
    linear:   { category: "minimalist", prompt: `Design an angled minimal icon inspired by Linear. DO use dark navy and modern simplicity. DON’T duplicate their stroke directions. Insert "{{USER_TEXT}}".` },
    vercel:   { category: "minimalist", prompt: `Design a minimal triangle-based mark referencing Vercel. DO use a simple black triangle on white. DON’T match their exact ratios. Add "{{USER_TEXT}}".` },
    notion:   { category: "minimalist", prompt: `Design a blocky letterform inspired by Notion. DO use black–white contrast. DON’T replicate their cube layout. Insert "{{USER_TEXT}}".` },
  };

  const categories = ["general", "social", "entertainment", "sport", "gaming", "tech", "news", "minimalist"];

  const filteredKeys = useMemo(
    () => Object.keys(templates).filter(k => templates[k].category === category),
    [category]
  );

  const promptOutput = useMemo(() => {
    if (!template || !text) return "";
    return templates[template]?.prompt.replace("{{USER_TEXT}}", text) ?? "";
  }, [template, text]);

  const handleCategoryChange = (next: string) => {
    setCategory(next);
    setTemplate("");
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(promptOutput);
  };

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-8">

        <h1 className="text-2xl font-bold">Logo Prompt Generator</h1>

        {/* Category – 8 buttons */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Category
          </label>
          <div className="grid grid-cols-4 gap-2">
            {categories.map(c => (
              <Button
                key={c}
                variant={category === c ? "default" : "outline"}
                className="capitalize h-10 rounded-xl text-sm"
                onClick={() => handleCategoryChange(c)}
              >
                {c}
              </Button>
            ))}
          </div>
        </div>

        {/* Template Selector */}
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Logo Template
          </label>
          <Select
            value={template}
            onValueChange={setTemplate}
            disabled={filteredKeys.length === 0}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={filteredKeys.length === 0 ? "No templates for this category" : "Pick logo style"}
              />
            </SelectTrigger>
            <SelectContent>
              {filteredKeys.map(key => (
                <SelectItem key={key} value={key}>
                  {key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
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

        {/* Generate Image Links */}
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Generate Image With
          </label>
          <p className="text-xs text-muted-foreground">
            Copy the prompt above, then open one of these tools and paste it to generate your logo.
          </p>
          <a
            href="https://chatgpt.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-12 rounded-xl border border-border bg-background hover:bg-muted transition-colors text-sm font-semibold"
          >
            <img
              src="https://cdn.oaistatic.com/assets/favicon-o20kmmos.svg"
              alt="ChatGPT"
              className="w-5 h-5"
            />
            ChatGPT
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
          </a>
        </div>

      </CardContent>
    </Card>
  );
}