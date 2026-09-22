import type { ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";
import splashUrl from "@/assets/mgcode-splash.png";

interface RootStartupLoadingProps {
  label: string;
  children?: ReactNode;
  busy?: boolean;
}

export function RootStartupLoading({ label, children, busy = true }: RootStartupLoadingProps) {
  return (
    <div
      // Web 端全局 html/body/#root 为 Electron 透明背景让路，React 接管后会替换 HTML 启动壳。
      // 这里必须由阻塞态自身承接主题背景，否则远控链接会在 Root 恢复期间继续露出浏览器白底。
      className="flex h-full min-h-dvh flex-col items-center justify-center gap-6 bg-background text-foreground"
      role="status"
      aria-busy={busy}
      aria-label={label}
      data-testid="root-startup-loading"
    >
      <ZCodeStartupLogoBadge />
      {children}
    </div>
  );
}

/** HTML 启动壳之后仍会进入 React 阻塞态；两阶段必须使用同一芒果娘资源。 */
export function ZCodeStartupLogoBadge({ animated = true }: { animated?: boolean }) {
  return (
    <div className="flex size-32 items-center justify-center rounded-3xl border border-border bg-panel shadow-xl/20">
      <img
        src={splashUrl}
        alt="mgcode"
        width={112}
        height={112}
        className={cn("object-contain", animated && "motion-safe:animate-pulse")}
        draggable={false}
      />
    </div>
  );
}
