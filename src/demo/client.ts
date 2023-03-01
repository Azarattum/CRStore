import { createTRPCProxyClient, createWSClient, wsLink } from "@trpc/client";
import type { App } from "./server";

const proxy = new Proxy(() => {}, {
  apply: () => proxy,
  get: () => proxy,
  set: () => proxy,
}) as never;

export const trpc =
  "window" in globalThis
    ? createTRPCProxyClient<App>({
        links: [
          wsLink({
            client: createWSClient({
              url: "ws://localhost:5173/trpc",
            }),
          }),
        ],
      })
    : proxy;
