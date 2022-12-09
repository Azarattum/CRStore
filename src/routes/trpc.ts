import { browser } from "$app/environment";
import { createTRPCProxyClient, createWSClient, wsLink } from "@trpc/client";
import type { App } from "../trpc";

const client = () =>
  createTRPCProxyClient<App>({
    links: [
      wsLink({
        client: createWSClient({
          url: "ws://localhost:5173/trpc",
        }),
      }),
    ],
  });

const proxy: any = new Proxy(() => {}, {
  apply: () => proxy,
  get: () => proxy,
  set: () => proxy,
});

const trpc = browser ? client() : (proxy as ReturnType<typeof client>);

export { trpc };
