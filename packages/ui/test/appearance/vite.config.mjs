import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
export default defineConfig({
  root: process.cwd(),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve("packages/ui/src"),
      "d3-path": resolve("node_modules/d3-path/src/index.js"),
    },
  },
  define: {
    __ZCODE_VERSION__: JSON.stringify("review"),
    __ZCODE_ENV__: JSON.stringify("test"),
    __ZCODE_COMMIT__: JSON.stringify("review"),
  },
  server: { host: "127.0.0.1", port: 5188 },
});
