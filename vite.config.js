import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { sveltekit } from "@sveltejs/kit/vite";
import { router } from "./src/demo/server";
import { WebSocketServer } from "ws";
import { resolve } from "path";
import { parse } from "url";

/** @type {import('vite').UserConfig} */
const config = {
  plugins: [
    sveltekit(),
    {
      name: "vite-trpc-ws",
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
  resolve: {
    alias: [
      {
        find: "crstore/runtime",
        customResolver: (_0, _1, { ssr }) =>
          ssr
            ? resolve("./runtime/native.js")
            : resolve("./runtime/browser.js"),
      },
    ],
  },
  build: {
    target: "es2020",
    rollupOptions: { external: ["path", "url"] },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2020",
    },
  },
  server: {
    fs: { allow: ["runtime"] },
  },
  test: { env: { SSR: "" } },
};

export default config;
