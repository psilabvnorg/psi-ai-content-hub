import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type DropZoneProps = {
  file: File | null;
  onFile: (f: File | null) => void;
  accept: string;
  /** Placeholder label shown when no file is selected */
  label: string;
  /** Sub-hint shown below the label when no file is selected; omit to hide */
  hint?: string;
  /** Icon element rendered above the label. Include any wrapping container in this prop. */
  icon: React.ReactNode;
  disabled?: boolean;
  /** Extra Tailwind classes — merged via twMerge so you can override defaults (gap, padding, border) */
  className?: string;
};

/**
 * Styled file-drop zone built as an accessible <label>.
 *
 * Defaults: gap-2, px-6, py-8, border-accent/60 (hover: border-accent bg-accent/5)
 * Override any of these via `className` (merged with twMerge).
 */
export function DropZone({ file, onFile, accept, label, hint, icon, disabled, className }: DropZoneProps) {
  return (
    <label
      className={cn(
        "flex flex-col items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors cursor-pointer",
        disabled
          ? "opacity-50 cursor-not-allowed border-border"
          : "border-accent/60 hover:border-accent hover:bg-accent/5",
        className,
      )}
    >
      {icon}
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-foreground">{file ? (file.name.length > 40 ? `${file.name.slice(0, 40)}…` : file.name) : label}</p>
        {(file !== null || hint) ? (
          <p className="text-xs text-muted-foreground">
            {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : hint}
          </p>
        ) : null}
      </div>
      <Input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] || null)}
        disabled={disabled}
      />
    </label>
  );
}
