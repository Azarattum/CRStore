import { initTRPC } from "@trpc/server";

const { router, procedure } = initTRPC.create();
export { router, procedure };
