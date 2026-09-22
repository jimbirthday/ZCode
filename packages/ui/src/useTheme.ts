import { useZCodeStore } from "@/store/StoreProvider.js";
export {
  applyTheme,
  isTheme,
  normalizeThemePreference,
  resolveTheme,
} from "./theme/theme-application.js";
export type { Theme, ResolvedTheme } from "./theme/theme-application.js";

// 旧 hook 自己保存主题会与窗口 store 竞争；统一读取唯一 owner。
export function useTheme() {
  const theme = useZCodeStore((state) => state.theme);
  const setTheme = useZCodeStore((state) => state.setTheme);
  return { theme, setTheme } as const;
}
