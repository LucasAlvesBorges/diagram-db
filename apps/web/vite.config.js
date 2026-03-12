import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/projects": process.env.API_PROXY_TARGET || "http://127.0.0.1:3000",
      "/save": process.env.API_PROXY_TARGET || "http://127.0.0.1:3000",
      "/load": process.env.API_PROXY_TARGET || "http://127.0.0.1:3000"
    }
  }
});
