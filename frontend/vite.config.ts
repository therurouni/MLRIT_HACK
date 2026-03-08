import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { createReadStream, existsSync, statSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    {
      name: "serve-frames",
      configureServer(server) {
        const framesDir = resolve(__dirname, "../frames");
        server.middlewares.use("/frames", (req, res, next) => {
          const filePath = resolve(framesDir, (req.url || "").replace(/^\//, ""));
          if (!filePath.startsWith(framesDir)) return next();
          if (!existsSync(filePath) || !statSync(filePath).isFile()) return next();
          res.setHeader("Content-Type", "image/jpeg");
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          createReadStream(filePath).pipe(res);
        });
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8484",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8484",
        ws: true,
      },
    },
  },
});
