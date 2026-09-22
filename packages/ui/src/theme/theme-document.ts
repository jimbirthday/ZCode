export type ThemeColorScheme = "light" | "dark";

export interface ThemeDocument {
  id: string;
  name: string;
  colorScheme: ThemeColorScheme;
  colors: {
    background: string;
    foreground: string;
    accent: string;
    border: string;
    brand: string;
  };
  typography: {
    fontFamily: string;
    scale: number;
  };
  density: number;
  radiusPx: number;
  motion: {
    durationMs: number;
    easing: string;
    reducedMotion: boolean;
  };
}

export interface ThemeTokens {
  colorScheme: ThemeColorScheme;
  background: string;
  foreground: string;
  accent: string;
  border: string;
  brand: string;
  fontFamily: string;
  fontSizePx: number;
  density: number;
  radiusPx: number;
  motionDuration: string;
  motionEasing: string;
  reducedMotion: boolean;
}

export type ThemeDocumentResult =
  | { ok: true; document: ThemeDocument; tokens: ThemeTokens }
  | { ok: false; error: string };

const COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const BASE_FONT_PX = 14;

export function compileThemeDocument(input: unknown): ThemeDocumentResult {
  const parsed = parseThemeDocument(input);
  if (!parsed.ok) return parsed;
  return { ok: true, document: parsed.document, tokens: tokensFromDocument(parsed.document) };
}

export function parseThemeDocument(
  input: unknown,
): { ok: true; document: ThemeDocument } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "theme must be an object" };
  const record = input as Record<string, unknown>;
  const id = readString(record.id);
  const name = readString(record.name);
  if (!id || !name) return { ok: false, error: "theme needs id and name" };
  if (record.colorScheme !== "light" && record.colorScheme !== "dark") {
    return { ok: false, error: "colorScheme must be light or dark" };
  }
  if (!isColorMap(record.colors)) return { ok: false, error: "colors are incomplete" };
  if (!record.typography || typeof record.typography !== "object") {
    return { ok: false, error: "typography is required" };
  }
  const typeRecord = record.typography as Record<string, unknown>;
  const fontFamily = readString(typeRecord.fontFamily);
  if (
    !fontFamily ||
    typeof typeRecord.scale !== "number" ||
    typeRecord.scale < 0.8 ||
    typeRecord.scale > 1.6
  ) {
    return { ok: false, error: "typography scale must be between 0.8 and 1.6" };
  }
  if (typeof record.density !== "number" || record.density < 0.7 || record.density > 1.6) {
    return { ok: false, error: "density must be between 0.7 and 1.6" };
  }
  if (typeof record.radiusPx !== "number" || record.radiusPx < 0 || record.radiusPx > 28) {
    return { ok: false, error: "radiusPx must be between 0 and 28" };
  }
  if (!record.motion || typeof record.motion !== "object")
    return { ok: false, error: "motion is required" };
  const motion = record.motion as Record<string, unknown>;
  if (
    typeof motion.durationMs !== "number" ||
    motion.durationMs < 0 ||
    motion.durationMs > 800 ||
    typeof motion.easing !== "string" ||
    !motion.easing.trim() ||
    typeof motion.reducedMotion !== "boolean"
  ) {
    return { ok: false, error: "motion needs durationMs, easing, and reducedMotion" };
  }
  return {
    ok: true,
    document: {
      id,
      name,
      colorScheme: record.colorScheme,
      colors: record.colors,
      typography: { fontFamily, scale: typeRecord.scale },
      density: record.density,
      radiusPx: record.radiusPx,
      motion: {
        durationMs: motion.durationMs,
        easing: motion.easing.trim(),
        reducedMotion: motion.reducedMotion,
      },
    },
  };
}

export function tokensFromDocument(theme: ThemeDocument): ThemeTokens {
  return {
    colorScheme: theme.colorScheme,
    background: theme.colors.background,
    foreground: theme.colors.foreground,
    accent: theme.colors.accent,
    border: theme.colors.border,
    brand: theme.colors.brand,
    fontFamily: theme.typography.fontFamily,
    fontSizePx: Math.round(BASE_FONT_PX * theme.typography.scale),
    density: theme.density,
    radiusPx: theme.radiusPx,
    motionDuration: theme.motion.reducedMotion ? "0ms" : `${theme.motion.durationMs}ms`,
    motionEasing: theme.motion.easing,
    reducedMotion: theme.motion.reducedMotion,
  };
}

export function resolveBuiltInTheme(
  theme: "system" | "light" | "dark" | "zai-light" | "zai-dark" | "mango",
  systemDark: boolean,
): "light" | "dark" {
  if (theme === "system") return systemDark ? "dark" : "light";
  return theme === "dark" || theme === "zai-dark" || theme === "mango" ? "dark" : "light";
}

export function tokensDifferOnNonColorAxes(left: ThemeTokens, right: ThemeTokens): boolean {
  return (
    left.fontSizePx !== right.fontSizePx ||
    left.density !== right.density ||
    left.radiusPx !== right.radiusPx ||
    left.motionDuration !== right.motionDuration ||
    left.motionEasing !== right.motionEasing
  );
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isColorMap(value: unknown): value is ThemeDocument["colors"] {
  if (!value || typeof value !== "object") return false;
  const colors = value as Record<string, unknown>;
  return ["background", "foreground", "accent", "border", "brand"].every(
    (key) => typeof colors[key] === "string" && COLOR.test(colors[key] as string),
  );
}
