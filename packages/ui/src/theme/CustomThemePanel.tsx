import { useZCodeStore } from "@/store/StoreProvider.js";
import { applyTheme } from "@/theme/theme-application.js";
import { applyUiFontSizePx } from "@/lib/uiFontSize.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import {
  browserThemeStorage,
  applyAppearanceThemeCommand,
  applyStoredCustomTheme,
  loadStoredThemeLibrary,
  storeThemeLibrary,
  type AppearanceThemeCommand,
  type ThemeLibrary,
} from "@/theme/theme-library.js";

const SAMPLE = {
  id: "custom-amber",
  name: "Amber",
  colorScheme: "dark",
  colors: {
    background: "#14110c",
    foreground: "#fff8ea",
    accent: "#3a2a10",
    border: "#5a4314",
    brand: "#ffc107",
  },
  typography: { fontFamily: "Iowan Old Style, Palatino, serif", scale: 1.05 },
  density: 1.05,
  radiusPx: 14,
  motion: { durationMs: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", reducedMotion: false },
};

function loadLibrary(): ThemeLibrary {
  return loadStoredThemeLibrary(browserThemeStorage);
}

function persist(library: ThemeLibrary) {
  storeThemeLibrary(browserThemeStorage, library);
}

export function CustomThemePanel({
  onActiveChange,
}: {
  onActiveChange?: (active: boolean) => void;
}) {
  const { intl } = useZCodeIntl();
  const theme = useZCodeStore((s) => s.theme);
  const fontSize = useZCodeStore((s) => s.uiFontSizePx);
  const [library, setLibrary] = useState<ThemeLibrary>(loadLibrary);
  const [draft, setDraft] = useState(JSON.stringify(SAMPLE, null, 2));
  const [error, setError] = useState<string | null>(null);

  const commit = (command: AppearanceThemeCommand) => {
    const next = applyAppearanceThemeCommand(library, command);
    if (next.error) {
      setError(next.error);
      return;
    }
    setError(null);
    setLibrary(next.library);
    onActiveChange?.(Boolean(next.library.activeId));
    persist(next.library);
    // 移除最后一个自定义主题时恢复保存的内置偏好，不能只清 token 留下旧 class。
    applyTheme(theme);
    applyUiFontSizePx(fontSize);
    if (next.library.activeId)
      applyStoredCustomTheme(document.documentElement, browserThemeStorage);
  };

  return (
    <div className="min-w-0 space-y-3" data-testid="custom-theme-panel">
      <div>
        <h3 className="text-ui-lg font-semibold text-foreground">
          {intl.formatMessage({ id: "settings.customTheme.title" })}
        </h3>
        <p className="mt-1 text-ui-base leading-6 text-foreground-subtle">
          {intl.formatMessage({ id: "settings.customTheme.description" })}
        </p>
      </div>
      <textarea
        aria-label={intl.formatMessage({ id: "settings.customTheme.document" })}
        className="min-h-40 w-full rounded-md border border-border bg-background p-3 font-mono text-ui-sm"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      {error ? <p className="text-ui-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => {
            try {
              commit({ kind: "save", document: JSON.parse(draft) });
            } catch {
              setError("theme must be an object");
            }
          }}
        >
          {intl.formatMessage({ id: "settings.customTheme.save" })}
        </Button>
        {library.themes.map((theme) => (
          <Button
            key={theme.id}
            type="button"
            variant="outline"
            onClick={() => commit({ kind: "switch", id: theme.id })}
          >
            {theme.name}
          </Button>
        ))}
        {library.activeId ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => commit({ kind: "remove", id: library.activeId! })}
          >
            {intl.formatMessage({ id: "settings.customTheme.remove" })}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
