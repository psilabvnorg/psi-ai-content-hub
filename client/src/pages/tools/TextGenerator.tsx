import { useRef, useState } from "react";
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
  const [text, setText] = useState("Your Text");
  const [font, setFont] = useState("Inter");
  const [size, setSize] = useState(64);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [shadow, setShadow] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

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
        {/* Controls */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold uppercase">Text</label>
            <input
              className="w-full h-12 border border-border rounded-md px-3"
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
              max={160}
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
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="relative w-full h-[400px] rounded-xl border border-border overflow-hidden bg-transparent flex items-center justify-center"
        >
          <div
            style={{
              fontFamily: font,
              fontSize: size,
              fontWeight: isBold ? "700" : "400",
              fontStyle: isItalic ? "italic" : "normal",
              textShadow: shadow ? "3px 3px 8px rgba(0,0,0,0.5)" : "none",
              whiteSpace: "pre",
              userSelect: "none",
            }}
          >
            {text}
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