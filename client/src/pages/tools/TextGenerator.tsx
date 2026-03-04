import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import html2canvas from "html2canvas";

export default function TextGenerator() {
  const [text, setText] = useState(
    "Amazon WorkMail is a secure, managed business email and calendar service with support for existing desktop and mobile email client applications."
  );

  const [font, setFont] = useState("Inter");
  const [size, setSize] = useState(64);

  const [align, setAlign] = useState<"left" | "center" | "right">("center");

  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [shadow, setShadow] = useState(false);

  const [wrapped, setWrapped] = useState<string[]>([]);

  const previewRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // ---------- Line Wrapping Algorithm ----------
  const strictWrap = (rawText: string, ctx: CanvasRenderingContext2D, maxWidth: number): string[] => {
    const words = rawText.split(" ");
    const lines: string[] = [];
    let current = "";

    words.forEach((word) => {
      const testLine = current ? current + " " + word : word;
      if (ctx.measureText(testLine).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = testLine;
      }
    });

    if (current) lines.push(current);

    // Pass 2: fix single-word orphans anywhere in the middle
    for (let i = lines.length - 1; i >= 1; i--) {
      if (lines[i].trim().split(" ").length === 1) {
        const merged = lines[i - 1] + " " + lines[i];
        if (ctx.measureText(merged).width <= maxWidth) {
          // Pull the orphan up onto the previous line
          lines.splice(i - 1, 2, merged);
        } else {
          // Redistribute: push last word of previous line down to this line
          const prevWords = lines[i - 1].trim().split(" ");
          if (prevWords.length > 1) {
            const moved = prevWords[prevWords.length - 1];
            lines[i - 1] = prevWords.slice(0, -1).join(" ");
            lines[i] = moved + " " + lines[i];
          }
        }
      }
    }

    // Pass 3: merge last line if it has <= 2 words and fits
    if (lines.length > 1) {
      const lastWords = lines[lines.length - 1].trim().split(" ");
      if (lastWords.length <= 2) {
        const merged = lines[lines.length - 2] + " " + lines[lines.length - 1];
        if (ctx.measureText(merged).width <= maxWidth) {
          lines.splice(lines.length - 2, 2, merged);
        }
      }
    }

    return lines;
  };

  // ---------- Auto Fit Font Size ----------
  const autoFit = () => {
    if (!previewRef.current) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    let newSize = 160;

    const maxWidth = previewRef.current.clientWidth - 56;
    const maxHeight = previewRef.current.clientHeight - 56;

    while (newSize > 10) {
      ctx.font = `${isItalic ? "italic " : ""}${isBold ? "bold " : ""}${newSize}px ${font}`;
      let lines = strictWrap(text, ctx, maxWidth);
      const lineHeight = newSize * 1.4;

      if (lines.length * lineHeight <= maxHeight) break;

      newSize -= 2;
    }

    setSize(newSize);
  };

  // ---------- Recalculate wrapping whenever text or styles change ----------
  useEffect(() => {
    if (!previewRef.current) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    ctx.font = `${isItalic ? "italic " : ""}${isBold ? "bold " : ""}${size}px ${font}`;

    const maxWidth = previewRef.current.clientWidth - 56;

    setWrapped(strictWrap(text, ctx, maxWidth));
  }, [text, size, font, isBold, isItalic]);

  // ---------- Export PNG ----------
  const downloadPNG = async () => {
    if (!canvasRef.current) return;

    const canvas = await html2canvas(canvasRef.current, {
      backgroundColor: null,
      scale: 2,
    });

    const link = document.createElement("a");
    link.download = "text.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <Card className="w-full border-none shadow-[0_8px_30px_rgba(0,0,0,0.04)] bg-card">
      <CardContent className="p-8 space-y-8">

        {/* Inputs */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold uppercase">Text</label>
            <textarea
              className="w-full h-28 border border-border rounded-md px-3 py-2"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase">Font</label>
            <Select value={font} onValueChange={setFont}>
              <SelectTrigger>
                <SelectValue placeholder="Select font" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Inter">Inter</SelectItem>
                <SelectItem value="Roboto">Roboto</SelectItem>
                <SelectItem value="Georgia">Georgia</SelectItem>
                <SelectItem value="Impact">Impact</SelectItem>
                <SelectItem value="Comic Sans MS">Comic Sans</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-bold uppercase">Font Size</label>
            <input
              type="range"
              min={16}
              max={200}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="flex items-end space-x-3">
            <Button
              variant={isBold ? "default" : "outline"}
              className="w-full"
              onClick={() => setIsBold(!isBold)}
            >
              Bold
            </Button>
            <Button
              variant={isItalic ? "default" : "outline"}
              className="w-full"
              onClick={() => setIsItalic(!isItalic)}
            >
              Italic
            </Button>
            <Button
              variant={shadow ? "default" : "outline"}
              className="w-full"
              onClick={() => setShadow(!shadow)}
            >
              Shadow
            </Button>
          </div>

          {/* Alignment */}
          <div className="flex items-end space-x-2">
            <Button
              variant={align === "left" ? "default" : "outline"}
              className="w-full"
              onClick={() => setAlign("left")}
            >
              Left
            </Button>
            <Button
              variant={align === "center" ? "default" : "outline"}
              className="w-full"
              onClick={() => setAlign("center")}
            >
              Center
            </Button>
            <Button
              variant={align === "right" ? "default" : "outline"}
              className="w-full"
              onClick={() => setAlign("right")}
            >
              Right
            </Button>
          </div>

          {/* Auto-fit */}
          <div className="flex items-end">
            <Button onClick={autoFit} className="w-full bg-orange-500 text-white">
              Auto Fit Font Size
            </Button>
          </div>
        </div>

        {/* Preview Area */}
        <div
          ref={previewRef}
          className="relative w-full h-[400px] rounded-xl border border-border overflow-hidden bg-transparent flex px-6 py-6"
        >
          <div
            ref={canvasRef}
            className="w-full h-full flex flex-col"
            style={{
              fontFamily: font,
              fontSize: size,
              fontWeight: isBold ? "700" : "400",
              fontStyle: isItalic ? "italic" : "normal",
              textShadow: shadow ? "3px 3px 8px rgba(0,0,0,0.5)" : "none",
              textAlign: align,
              userSelect: "none",
              lineHeight: 1.4,
              whiteSpace: "pre-line",
            }}
          >
            {wrapped.join("\n")}
          </div>
        </div>

        {/* Export */}
        <Button onClick={downloadPNG} className="w-full h-12 rounded-xl font-bold">
          Download Transparent PNG
        </Button>
      </CardContent>
    </Card>
  );
}