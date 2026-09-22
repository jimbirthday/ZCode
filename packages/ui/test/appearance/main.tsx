// Browser fixture uses production theme controls, tokens and store; no application services.
import React from "react";
import "./fixture.css";
import { createRoot } from "react-dom/client";
import { StoreProvider, useZCodeStore } from "../../src/store/StoreProvider";
import { ZCodeIntlProvider } from "../../src/i18n/IntlProvider";
import { AppearanceSectionContent } from "../../src/settingsCodePreview";
import { RootStartupLoading } from "../../src/root/RootStartupLoading";
import { Button } from "../../src/components/ui/button";
import { THEME_MODES } from "../../src/settings/settingsPageConfig";
import mark from "../../src/assets/mgcode-mark.png";
const broadcast = {
  send: async () => {},
  onMessage: () => ({ dispose() {} }),
  acquireClaim: async () => ({ status: "unavailable" }),
  commitClaim: async () => {},
  releaseClaim: async () => {},
  tryClaim: async () => false,
};
function Review() {
  const state = useZCodeStore((s) => s);
  return (
    <div
      data-review-scroll
      className="h-dvh overflow-y-auto bg-background text-foreground text-ui-base"
    >
      <header className="border-b border-border bg-header p-4 font-semibold">
        mgcode <span className="ml-4 text-foreground-subtle">外观与阅读体验</span>
      </header>
      <div className="grid min-h-dvh md:grid-cols-[260px_1fr]">
        <aside
          data-workspace-sidebar-panel="true"
          className="space-y-4 md:sticky md:top-0 md:h-dvh border-r border-border p-4"
        >
          <h2 className="font-medium">主题</h2>
          {THEME_MODES.map(({ mode }) => (
            <Button
              className="w-full"
              variant={state.theme === mode ? "default" : "outline"}
              key={mode}
              onClick={() => state.setTheme(mode)}
            >
              {mode}
            </Button>
          ))}
          <p className="text-foreground-subtle">任务列表 · 最近会话</p>
          <div className="rounded-lg bg-selected p-3">重新设计 mgcode</div>
          <p className="text-foreground-subtlest">今天 · 所有更改已保存</p>
        </aside>
        <main data-workspace-conversation-frame="true" className="min-w-0 space-y-8 p-6">
          <div className="flex items-center gap-4">
            <img src={mark} width="120" alt="芒果娘" />
            <div>
              <h1 className="text-ui-xl font-semibold">下午好，一起开始吧</h1>
              <p className="text-foreground-subtle">温暖、清晰、专注于每一次对话。</p>
            </div>
          </div>
          <article className="rounded-xl border border-border bg-card p-4">
            <p>正文：夜空蓝阅读区，奶油白文字。</p>
            <p className="text-foreground-subtle">辅助信息：任务状态、模型名称与时间。</p>
            <p className="text-foreground-subtlest">较弱信息仍然需要清晰可读。</p>
            <input
              aria-label="消息"
              placeholder="向 mgcode 发送消息"
              className="my-3 w-full rounded-lg border border-input-border bg-input p-3 text-foreground"
            />
            <Button>发送消息</Button>
          </article>
          <AppearanceSectionContent
            theme={state.theme}
            setTheme={state.setTheme}
            codePreviewSettings={state.codePreviewSettings}
            setCodePreviewSettings={state.setCodePreviewSettings}
            uiFontSizePx={state.uiFontSizePx}
            setUiFontSizePx={state.setUiFontSizePx}
          />
          <RootStartupLoading label="启动预览" />
        </main>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <StoreProvider broadcastService={broadcast as any}>
    <ZCodeIntlProvider initialLocale="zh-CN">
      <Review />
    </ZCodeIntlProvider>
  </StoreProvider>,
);
