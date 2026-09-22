# Appearance browser regression

From the repository root, with Node 24.14.0 and pnpm:

```sh
pnpm exec vite --config packages/ui/test/appearance/vite.config.mjs
node packages/ui/test/appearance/appearance.e2e.mjs
```

Set `CHROME_PATH` to a Chromium executable on non-macOS systems. This is an isolated
fixture using the production Zustand store, Appearance controls, startup component
and theme CSS. It does not start a Host, Agent or database or modify user preferences.
It tests built-in round trips and reloads, custom-theme exit/removal, system mode,
startup image, semantic text contrast and 390px layout. Screenshots and measurements
are written to `output/mgcode-review/`. Full workspace navigation still needs a
working desktop/server runtime.
