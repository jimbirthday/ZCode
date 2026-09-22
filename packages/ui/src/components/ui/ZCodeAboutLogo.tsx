import { cn } from "@/components/lib/utils.js";
import mangoGirlUrl from "@/assets/mgcode-splash.png";

export function ZCodeAboutLogo({ className }: { className?: string }) {
  return (
    <img
      src={mangoGirlUrl}
      alt="mgcode"
      className={cn("shrink-0 rounded-xl object-cover object-top", className)}
      draggable={false}
    />
  );
}

export function ZCodeWordmarkLogo({ className }: { className?: string }) {
  return (
    <span className={cn("shrink-0 text-ui-xl font-semibold tracking-tight", className)}>
      mgcode
    </span>
  );
}
