import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        "@tkomde/iohook",
        "electron",
        "bufferutil",
        "utf-8-validate"
      ]
    }
  }
});
