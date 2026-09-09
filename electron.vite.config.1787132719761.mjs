// electron.vite.config.ts
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
var shared = { "@shared": resolve("src/shared") };
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    build: { rollupOptions: { input: { index: resolve("src/main/index.ts") } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared },
    build: { rollupOptions: { input: { index: resolve("src/preload/index.ts") } } }
  },
  renderer: {
    root: "src/renderer",
    resolve: { alias: { "@": resolve("src/renderer/src"), ...shared } },
    build: { rollupOptions: { input: { index: resolve("src/renderer/index.html") } } },
    plugins: [react()]
  }
});
export {
  electron_vite_config_default as default
};
