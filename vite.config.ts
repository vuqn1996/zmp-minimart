import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import zaloMiniApp from "zmp-vite-plugin";

export default defineConfig({
  base: "./",
  plugins: [react(), zaloMiniApp()],
  server: {
    port: 3000,
    cors: { origin: "https://h5.zdn.vn", credentials: true },
  },
  build: {
    outDir: "www",
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].[hash].module.js",
        chunkFileNames: "assets/[name].[hash].module.js",
        assetFileNames: "assets/[name].[hash][extname]",
      },
    },
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
