import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        "application-loopback",
        "keyspy",
        "electron",
        "bufferutil",
        "utf-8-validate"
      ]
    }
  }
});
