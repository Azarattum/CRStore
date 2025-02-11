// @ts-nocheck
import { narrowSolidPlugin } from "@merged/react-solid/plugin";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { sveltekit } from "@sveltejs/kit/vite";
import type { UserConfig } from "vite";
import { WebSocketServer } from "ws";
import { resolve } from "path";
import { parse } from "url";

const config = {
  plugins: [
    sveltekit(),
    narrowSolidPlugin({
      include: /\/src\/demo\/frameworks\/solid/,
      hot: false,
    }),
    {
      name: "vite-trpc-ws",
      async configureServer(server) {
        const { router } = await import("./src/demo/server");
        const wss = new WebSocketServer({ noServer: true });
        server.httpServer?.on("upgrade", (request, socket, head) => {
          const { pathname } = parse(request.url);
          if (pathname === "/trpc") {
            wss.handleUpgrade(request, socket, head, (ws) => {
              wss.emit("connection", ws, request);
            });
          }
        });
        applyWSSHandler({ wss, router });
      },
      async closeBundle() {
        await (await import("./src/demo/ssr/stores")).close();
        await (await import("./src/demo/todo/routes")).close();
        await (await import("./src/demo/library/routes")).close();
        await (await import("./src/demo/sortable/routes")).close();
        await (await import("./src/demo/frameworks/routes")).close();
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: "crstore/runtime",
        customResolver: (_0: any, _1: any, { ssr }: { ssr?: boolean }) =>
          ssr ? resolve("./runtime/server.js") : resolve("./runtime/browser.js"),
      } as any,
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
} satisfies UserConfig;

export default config;
