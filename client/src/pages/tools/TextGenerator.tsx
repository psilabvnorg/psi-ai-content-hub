import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import html2canvas from "html2canvas";
import { autoFitText, strictWrap } from "@/lib/utils";

export default function TextGenerator() {
  const [text, setText] = useState(
    "Amazon WorkMail is a secure, managed business email and calendar service with support for existing desktop and mobile email client applications."
  );

  const [font, setFont] = useState("Be Vietnam Pro");
  const [size, setSize] = useState(64);

  const [align, setAlign] = useState<"left" | "center" | "right">("center");

  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [shadow, setShadow] = useState(false);

  const [wrapped, setWrapped] = useState<string[]>([]);

  const previewRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // ---------- Auto Fit Font Size ----------
  const autoFit = () => {
    if (!previewRef.current) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const maxWidth = previewRef.current.clientWidth - 56;
    const maxHeight = previewRef.current.clientHeight - 56;
    const fitResult = autoFitText(text, ctx, {
      maxWidth,
      maxHeight,
      fontFamily: font,
      isBold,
      isItalic,
    });

    setSize(fitResult.fontSize);
  };

  // ---------- Recalculate wrapping whenever text or styles change ----------
  useEffect(() => {
    if (!previewRef.current) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    const maxWidth = previewRef.current.clientWidth - 56;
    ctx.font = `${isItalic ? "italic " : ""}${isBold ? "bold " : ""}${size}px ${font}`;
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
                <SelectGroup>
                  <SelectLabel>Impact-style (inherently bold)</SelectLabel>
                  <SelectItem value="Anton">Anton</SelectItem>
                  <SelectItem value="Barlow Condensed">Barlow Condensed</SelectItem>
                  <SelectItem value="Oswald">Oswald</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Vietnamese-friendly</SelectLabel>
                  <SelectItem value="Be Vietnam Pro">Be Vietnam Pro</SelectItem>
                  <SelectItem value="Noto Sans">Noto Sans</SelectItem>
                  <SelectItem value="Open Sans">Open Sans</SelectItem>
                  <SelectItem value="Roboto">Roboto</SelectItem>
                  <SelectItem value="Montserrat">Montserrat</SelectItem>
                  <SelectItem value="Nunito">Nunito</SelectItem>
                </SelectGroup>
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
