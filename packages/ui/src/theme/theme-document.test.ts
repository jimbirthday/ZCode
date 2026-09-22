import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  compileThemeDocument,
  tokensDifferOnNonColorAxes,
  tokensFromDocument,
} from "./theme-document.js";
import {
  applyAppearanceThemeCommand,
  applyStoredCustomTheme,
  emptyThemeLibrary,
  loadStoredThemeLibrary,
  removeCustomTheme,
  saveCustomTheme,
  storeThemeLibrary,
  switchCustomTheme,
  type ThemeStorage,
} from "./theme-library.js";

const harbor = {
  id: "harbor",
  name: "Harbor",
  colorScheme: "dark" as const,
  colors: {
    background: "#102033",
    foreground: "#f4efe6",
    accent: "#d7efe8",
    border: "#2d4a63",
    brand: "#e07a3d",
  },
  typography: { fontFamily: "Iowan Old Style, Palatino, serif", scale: 1.25 },
  density: 1.4,
  radiusPx: 18,
  motion: { durationMs: 420, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", reducedMotion: false },
};

const paper = {
  ...harbor,
  id: "paper",
  name: "Paper",
  colorScheme: "light" as const,
  colors: { ...harbor.colors, background: "#f7f1e8" },
  typography: { fontFamily: "Georgia, serif", scale: 0.9 },
  density: 0.8,
  radiusPx: 2,
  motion: { durationMs: 80, easing: "linear", reducedMotion: true },
};

function memoryStorage(): ThemeStorage & { snapshot(): Map<string, string> } {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    snapshot: () => values,
  };
}

test("custom theme changes color and non-color axes, and invalid input keeps the previous theme", () => {
  const first = compileThemeDocument(harbor);
  const second = compileThemeDocument(paper);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.notEqual(first.tokens.background, second.tokens.background);
  assert.equal(tokensDifferOnNonColorAxes(first.tokens, second.tokens), true);

  const storage = memoryStorage();
  const rootStyle = new Map<string, string>();
  const root = {
    classList: { toggle: () => undefined },
    style: {
      setProperty: (name: string, value: string) => rootStyle.set(name, value),
      removeProperty: (name: string) => rootStyle.delete(name),
    },
    setAttribute: () => undefined,
    removeAttribute: () => undefined,
  };

  const saved = saveCustomTheme(emptyThemeLibrary(), harbor);
  storeThemeLibrary(storage, saved.library);
  const restarted = loadStoredThemeLibrary(storage);
  assert.equal(restarted.activeId, "harbor");
  applyStoredCustomTheme(root, storage);
  assert.equal(rootStyle.get("--ui-font-size"), "18px");
  assert.equal(rootStyle.get("--theme-density"), "1.4");
  assert.equal(rootStyle.get("--theme-radius"), "18px");
  assert.equal(rootStyle.get("--theme-motion-duration"), "420ms");
  assert.equal(rootStyle.get("--theme-motion-easing"), harbor.motion.easing);
  assert.equal(rootStyle.get("--theme-font-family"), harbor.typography.fontFamily);
  assert.equal(rootStyle.get("--color-background"), "#102033");

  const withPaper = saveCustomTheme(restarted, paper);
  storeThemeLibrary(storage, withPaper.library);
  const switched = switchCustomTheme(loadStoredThemeLibrary(storage), "harbor");
  storeThemeLibrary(storage, switched.library);
  applyStoredCustomTheme(root, storage);
  assert.equal(switched.tokens?.fontSizePx, first.tokens.fontSizePx);
  assert.equal(rootStyle.get("--theme-radius"), "18px");

  const rejected = saveCustomTheme(loadStoredThemeLibrary(storage), { id: "bad" });
  assert.equal(rejected.error !== undefined, true);
  assert.equal(rejected.library.activeId, "harbor");
  assert.equal(tokensFromDocument(rejected.library.themes[0]!).radiusPx, 18);
  applyStoredCustomTheme(root, storage);
  assert.equal(rootStyle.get("--color-background"), "#102033");

  const removed = removeCustomTheme(rejected.library, "paper");
  storeThemeLibrary(storage, removed.library);
  assert.equal(
    loadStoredThemeLibrary(storage).themes.some((theme) => theme.id === "paper"),
    false,
  );
  applyStoredCustomTheme(root, storage);
  assert.equal(rootStyle.get("--theme-density"), "1.4");
});

test("save switch and remove round-trip a custom theme", () => {
  const storage = memoryStorage();
  const saved = saveCustomTheme(emptyThemeLibrary(), harbor);
  storeThemeLibrary(storage, saved.library);
  const withPaper = saveCustomTheme(loadStoredThemeLibrary(storage), paper);
  storeThemeLibrary(storage, withPaper.library);
  const switched = switchCustomTheme(loadStoredThemeLibrary(storage), "harbor");
  storeThemeLibrary(storage, switched.library);
  assert.equal(loadStoredThemeLibrary(storage).activeId, "harbor");
  assert.equal(switched.tokens?.fontSizePx, 18);
  assert.equal(switched.tokens?.density, 1.4);
  assert.equal(switched.tokens?.radiusPx, 18);
  const removed = removeCustomTheme(loadStoredThemeLibrary(storage), "paper");
  storeThemeLibrary(storage, removed.library);
  const afterRemove = loadStoredThemeLibrary(storage);
  assert.equal(
    afterRemove.themes.some((theme) => theme.id === "paper"),
    false,
  );
  assert.equal(
    afterRemove.themes.some((theme) => theme.id === "harbor"),
    true,
  );
  assert.equal(afterRemove.activeId, "harbor");
});

test("settings path creates, edits, saves, switches, and removes a theme document", () => {
  const created = applyAppearanceThemeCommand(emptyThemeLibrary(), {
    kind: "save",
    document: harbor,
  });
  assert.equal(created.error, undefined);
  const editedDocument = {
    ...harbor,
    name: "Harbor edited",
    typography: { fontFamily: "Georgia, serif", scale: 0.9 },
    density: 0.8,
    radiusPx: 2,
    motion: { durationMs: 80, easing: "linear", reducedMotion: true },
  };
  const edited = applyAppearanceThemeCommand(created.library, {
    kind: "save",
    document: editedDocument,
  });
  assert.equal(edited.error, undefined);
  assert.equal(tokensDifferOnNonColorAxes(created.tokens!, edited.tokens!), true);
  assert.notEqual(created.tokens?.fontSizePx, edited.tokens?.fontSizePx);
  assert.notEqual(created.tokens?.density, edited.tokens?.density);
  assert.notEqual(created.tokens?.radiusPx, edited.tokens?.radiusPx);
  assert.notEqual(created.tokens?.motionDuration, edited.tokens?.motionDuration);
  const withPaper = applyAppearanceThemeCommand(edited.library, {
    kind: "save",
    document: paper,
  });
  const switched = applyAppearanceThemeCommand(withPaper.library, {
    kind: "switch",
    id: "harbor",
  });
  assert.equal(switched.library.activeId, "harbor");
  assert.equal(switched.tokens?.density, 0.8);
  assert.equal(switched.tokens?.radiusPx, 2);
  const removed = applyAppearanceThemeCommand(switched.library, {
    kind: "remove",
    id: "paper",
  });
  assert.equal(removed.error, undefined);
  assert.equal(
    removed.library.themes.some((theme) => theme.id === "paper"),
    false,
  );
  assert.equal(removed.library.activeId, "harbor");
  const storage = memoryStorage();
  storeThemeLibrary(storage, removed.library);
  const rootStyle = new Map<string, string>();
  applyStoredCustomTheme(
    {
      classList: { toggle: () => undefined },
      style: {
        setProperty: (name: string, value: string) => rootStyle.set(name, value),
        removeProperty: (name: string) => rootStyle.delete(name),
      },
      setAttribute: () => undefined,
      removeAttribute: () => undefined,
    },
    storage,
  );
  assert.equal(rootStyle.get("--ui-font-size"), "13px");
  assert.equal(rootStyle.get("--theme-density"), "0.8");
  assert.equal(rootStyle.get("--theme-radius"), "2px");
  assert.equal(rootStyle.get("--theme-motion-duration"), "0ms");
});

test("store boot paints a saved custom theme after built-in theme and font size", () => {
  const dir = mkdtempSync(join(tmpdir(), "zcode-theme-boot-"));
  const script = join(dir, "boot.mts");
  writeFileSync(
    script,
    `import { createZCodeStore } from ${JSON.stringify(join(process.cwd(), "packages/ui/src/store/index.ts"))};
import { saveCustomTheme, emptyThemeLibrary, storeThemeLibrary } from ${JSON.stringify(join(process.cwd(), "packages/ui/src/theme/theme-library.ts"))};
import { UI_FONT_SIZE_STORAGE_KEY } from ${JSON.stringify(join(process.cwd(), "packages/ui/src/lib/uiFontSize.ts"))};

const harbor = ${JSON.stringify(harbor)};
const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};
storeThemeLibrary(storage, saveCustomTheme(emptyThemeLibrary(), harbor).library);
values.set(UI_FONT_SIZE_STORAGE_KEY, "12");
const style = new Map();
const attrs = new Map();
const root = {
  classList: { toggle: () => false },
  style: {
    setProperty: (name, value) => style.set(name, value),
    removeProperty: (name) => style.delete(name),
    getPropertyValue: (name) => style.get(name) ?? "",
  },
  setAttribute: (name, value) => attrs.set(name, value),
  removeAttribute: (name) => attrs.delete(name),
  hasAttribute: (name) => attrs.has(name),
  getAttribute: (name) => attrs.get(name) ?? null,
};
const localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage });
Object.defineProperty(globalThis, "document", { configurable: true, value: { documentElement: root } });
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage,
    matchMedia: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }),
  },
});
createZCodeStore({
  send: async () => undefined,
  acquireClaim: async () => ({ status: "unavailable" }),
  commitClaim: async () => undefined,
  releaseClaim: async () => undefined,
  tryClaim: async () => false,
  onMessage: () => ({ dispose() {} }),
});
console.log(JSON.stringify({
  applied: attrs.get("data-theme-applied") ?? null,
  fontSize: style.get("--ui-font-size") ?? null,
  density: style.get("--theme-density") ?? null,
  radius: style.get("--theme-radius") ?? null,
  motion: style.get("--theme-motion-duration") ?? null,
  background: style.get("--color-background") ?? null,
}));
`,
  );
  const ran = spawnSync(
    process.execPath,
    [
      join(process.cwd(), "node_modules/tsx/dist/cli.mjs"),
      "--tsconfig",
      join(process.cwd(), "packages/ui/tsconfig.json"),
      script,
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(ran.status, 0, ran.stderr);
  const painted = JSON.parse(ran.stdout.trim());
  assert.equal(painted.applied, "custom");
  assert.equal(painted.fontSize, "18px");
  assert.equal(painted.density, "1.4");
  assert.equal(painted.radius, "18px");
  assert.equal(painted.motion, "420ms");
  assert.equal(painted.background, "#102033");
});

test("built-in System, Light, and Dark still resolve", async () => {
  const { resolveBuiltInTheme } = await import("./theme-document.js");
  assert.equal(resolveBuiltInTheme("system", false), "light");
  assert.equal(resolveBuiltInTheme("system", true), "dark");
  assert.equal(resolveBuiltInTheme("light", false), "light");
  assert.equal(resolveBuiltInTheme("dark", false), "dark");
});

test("Mango is dark regardless of OS preference", async () => {
  const { resolveBuiltInTheme } = await import("./theme-document.js");
  assert.equal(resolveBuiltInTheme("mango", false), "dark");
  assert.equal(resolveBuiltInTheme("mango", true), "dark");
});

test("custom themes clear Mango decoration and choose a matching base", () => {
  const classes = new Set(["theme-mango", "theme-zai-dark", "dark"]);
  const root = {
    classList: {
      toggle: (name: string, force?: boolean) => {
        if (force) classes.add(name);
        else classes.delete(name);
      },
    },
    style: { setProperty() {}, removeProperty() {} },
    setAttribute() {},
    removeAttribute() {},
  };
  const storage = memoryStorage();
  storeThemeLibrary(storage, saveCustomTheme(emptyThemeLibrary(), paper).library);
  applyStoredCustomTheme(root, storage);
  assert.equal(classes.has("theme-mango"), false);
  assert.equal(classes.has("theme-zai-dark"), false);
  assert.equal(classes.has("theme-zai-light"), true);
  assert.equal(classes.has("dark"), false);
});
