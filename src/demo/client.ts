import { createTRPCProxyClient, createWSClient, wsLink } from "@trpc/client";
import type { App } from "./server";

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

const trpc = import.meta.env.SSR
  ? (proxy as ReturnType<typeof client>)
  : client();

export { trpc };
