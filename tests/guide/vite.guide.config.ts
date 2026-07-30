import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  cacheDir: "output/vite-guide-cache",
  server: {
    host: "127.0.0.1",
    port: 1422,
    strictPort: true
  },
  clearScreen: false
});
