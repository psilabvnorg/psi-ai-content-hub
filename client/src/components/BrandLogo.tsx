import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  imageClassName?: string;
  labelClassName?: string;
  label?: string;
};

export default function BrandLogo({
  className,
  imageClassName,
  labelClassName,
  label,
}: BrandLogoProps) {
  // Split label into two parts: "AI" and "Hub"
  const parts = label ? label.split(' ') : [];
  const firstPart = parts[0] || 'AI';
  const secondPart = parts.slice(1).join(' ') || 'Hub';

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img
        src="./logo.png"
        alt="AI Hub logo"
        className={cn(
          "h-10 w-auto object-contain",
          imageClassName,
        )}
      />
      {label ? (
        <div className={cn("flex items-center overflow-hidden rounded-lg", labelClassName)}>
          <span className="bg-black px-4 py-2 text-xl font-bold tracking-tight text-white">
            {firstPart}
          </span>
          <span className="px-4 py-2 text-xl font-bold tracking-tight text-black" style={{ backgroundColor: '#ffa31a' }}>
            {secondPart}
          </span>
        </div>
      ) : null}
    </div>
  );
}
