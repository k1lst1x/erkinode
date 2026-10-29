import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          terminal: ["@xterm/xterm", "@xterm/addon-fit", "@xterm/addon-search"],
          react: ["react", "react-dom/client"],
        },
      },
    },
  },
});
