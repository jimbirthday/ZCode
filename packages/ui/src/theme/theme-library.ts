import { readSafeLocalStorage, writeSafeLocalStorage } from "@/lib/browserEnvironment.js";
import {
  compileThemeDocument,
  tokensFromDocument,
  type ThemeDocument,
  type ThemeTokens,
} from "./theme-document.js";

export const CUSTOM_THEME_STORAGE_KEY = "zcode-custom-themes";
export const ACTIVE_CUSTOM_THEME_STORAGE_KEY = "zcode-active-custom-theme";

export interface ThemeLibrary {
  themes: ThemeDocument[];
  activeId: string | null;
}

export interface ThemeLibraryResult {
  library: ThemeLibrary;
  tokens: ThemeTokens | null;
  error?: string;
}

export function emptyThemeLibrary(): ThemeLibrary {
  return { themes: [], activeId: null };
}

export function saveCustomTheme(library: ThemeLibrary, input: unknown): ThemeLibraryResult {
  const compiled = compileThemeDocument(input);
  if (!compiled.ok) return { library, tokens: activeTokens(library), error: compiled.error };
  const themes = library.themes.filter((theme) => theme.id !== compiled.document.id);
  themes.push(compiled.document);
  return {
    library: { themes, activeId: compiled.document.id },
    tokens: compiled.tokens,
  };
}

export function switchCustomTheme(library: ThemeLibrary, id: string): ThemeLibraryResult {
  const theme = library.themes.find((item) => item.id === id);
  if (!theme) return { library, tokens: activeTokens(library), error: "theme not found" };
  return {
    library: { ...library, activeId: id },
    tokens: tokensFromDocument(theme),
  };
}

export type AppearanceThemeCommand =
  | { kind: "save"; document: unknown }
  | { kind: "switch"; id: string }
  | { kind: "remove"; id: string };

/** Shared settings command used by AppearanceSectionContent's custom theme panel. */
export function applyAppearanceThemeCommand(
  library: ThemeLibrary,
  command: AppearanceThemeCommand,
): ThemeLibraryResult {
  switch (command.kind) {
    case "save":
      return saveCustomTheme(library, command.document);
    case "switch":
      return switchCustomTheme(library, command.id);
    case "remove":
      return removeCustomTheme(library, command.id);
  }
}

export function removeCustomTheme(library: ThemeLibrary, id: string): ThemeLibraryResult {
  const themes = library.themes.filter((theme) => theme.id !== id);
  const activeId = library.activeId === id ? null : library.activeId;
  const next = { themes, activeId };
  return { library: next, tokens: activeTokens(next) };
}

export function activeTokens(library: ThemeLibrary): ThemeTokens | null {
  const theme = library.themes.find((item) => item.id === library.activeId);
  return theme ? tokensFromDocument(theme) : null;
}

export function serializeThemeLibrary(library: ThemeLibrary): string {
  return JSON.stringify(library);
}

export function readThemeLibrary(raw: string | null): ThemeLibrary {
  if (!raw) return emptyThemeLibrary();
  try {
    const parsed = JSON.parse(raw) as { themes?: unknown; activeId?: unknown };
    const themes = Array.isArray(parsed.themes)
      ? parsed.themes.flatMap((item) => {
          const compiled = compileThemeDocument(item);
          return compiled.ok ? [compiled.document] : [];
        })
      : [];
    const activeId = typeof parsed.activeId === "string" ? parsed.activeId : null;
    return {
      themes,
      activeId: themes.some((theme) => theme.id === activeId) ? activeId : null,
    };
  } catch {
    return emptyThemeLibrary();
  }
}

export interface ThemeRoot {
  classList: { toggle: (name: string, force?: boolean) => void };
  style: {
    setProperty: (name: string, value: string) => void;
    removeProperty: (name: string) => void;
  };
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
}

const TOKEN_PROPERTIES = [
  "--color-background",
  "--color-foreground",
  "--color-accent",
  "--color-border",
  "--color-brand",
  "--ui-font-size",
  "--theme-font-family",
  "--theme-density",
  "--theme-radius",
  "--theme-motion-duration",
  "--theme-motion-easing",
] as const;

export function applyThemeTokens(root: ThemeRoot, tokens: ThemeTokens | null): void {
  root.classList.toggle("dark", tokens?.colorScheme === "dark");
  if (!tokens) {
    root.removeAttribute("data-theme-applied");
    for (const property of TOKEN_PROPERTIES) root.style.removeProperty(property);
    return;
  }
  // 自定义主题必须清理芒果装饰并切换基础色板，否则浅色正文会叠在深色菜单上。
  root.classList.toggle("theme-mango", false);
  root.classList.toggle("theme-zai-dark", tokens.colorScheme === "dark");
  root.classList.toggle("theme-zai-light", tokens.colorScheme === "light");
  root.setAttribute("data-theme-applied", "custom");
  root.style.setProperty("--color-background", tokens.background);
  root.style.setProperty("--color-foreground", tokens.foreground);
  root.style.setProperty("--color-accent", tokens.accent);
  root.style.setProperty("--color-border", tokens.border);
  root.style.setProperty("--color-brand", tokens.brand);
  root.style.setProperty("--ui-font-size", `${tokens.fontSizePx}px`);
  root.style.setProperty("--theme-font-family", tokens.fontFamily);
  root.style.setProperty("--theme-density", String(tokens.density));
  root.style.setProperty("--theme-radius", `${tokens.radiusPx}px`);
  root.style.setProperty("--theme-motion-duration", tokens.motionDuration);
  root.style.setProperty("--theme-motion-easing", tokens.motionEasing);
}

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadStoredThemeLibrary(storage: ThemeStorage): ThemeLibrary {
  return readThemeLibrary(storage.getItem(CUSTOM_THEME_STORAGE_KEY));
}

export function storeThemeLibrary(storage: ThemeStorage, library: ThemeLibrary): void {
  storage.setItem(CUSTOM_THEME_STORAGE_KEY, serializeThemeLibrary(library));
  storage.setItem(ACTIVE_CUSTOM_THEME_STORAGE_KEY, library.activeId ?? "");
}

/** Restart path used by the shared hook: read storage, then paint the document root. */
export function applyStoredCustomTheme(root: ThemeRoot, storage: ThemeStorage): ThemeTokens | null {
  const tokens = activeTokens(loadStoredThemeLibrary(storage));
  applyThemeTokens(root, tokens);
  return tokens;
}

/**
 * 启动时内置主题和字号偏好会先清掉自定义 token。只有已保存的自定义主题仍是当前选择时才重画，
 * 避免没有自定义主题时把字号偏好一并清掉。
 */
export function reapplyActiveCustomTheme(
  root: ThemeRoot,
  storage: ThemeStorage,
): ThemeTokens | null {
  const tokens = activeTokens(loadStoredThemeLibrary(storage));
  if (!tokens) return null;
  applyThemeTokens(root, tokens);
  return tokens;
}

export function readAppliedTokens(style: { getPropertyValue: (name: string) => string }): {
  fontSize: string;
  density: string;
  radius: string;
  motionDuration: string;
  background: string;
} {
  return {
    fontSize: style.getPropertyValue("--ui-font-size").trim(),
    density: style.getPropertyValue("--theme-density").trim(),
    radius: style.getPropertyValue("--theme-radius").trim(),
    motionDuration: style.getPropertyValue("--theme-motion-duration").trim(),
    background: style.getPropertyValue("--color-background").trim(),
  };
}

export const browserThemeStorage: ThemeStorage = {
  getItem: readSafeLocalStorage,
  setItem: writeSafeLocalStorage,
};

export function paintStoredCustomTheme(): void {
  if (typeof document === "undefined") return;
  reapplyActiveCustomTheme(document.documentElement, browserThemeStorage);
}

export function clearActiveCustomTheme(): void {
  storeThemeLibrary(browserThemeStorage, {
    ...loadStoredThemeLibrary(browserThemeStorage),
    activeId: null,
  });
}
