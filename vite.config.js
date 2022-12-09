import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { sveltekit } from "@sveltejs/kit/vite";
import { router } from "./src/demo/server";
import { WebSocketServer } from "ws";
import { parse } from "url";

/** @type {import('vite').UserConfig} */
const config = {
  plugins: [
    sveltekit(),
    {
      name: "sveltekit-ws",
      configureServer(server) {
        const wss = new WebSocketServer({ noServer: true });
        server.httpServer.on("upgrade", (request, socket, head) => {
          const { pathname } = parse(request.url);
          if (pathname === "/trpc") {
            wss.handleUpgrade(request, socket, head, (ws) => {
              wss.emit("connection", ws, request);
            });
          }
        });
        applyWSSHandler({ wss, router });
      },
    },
  ],
  build: {
    target: "es2020",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2020",
    },
  },
};

export default config;
