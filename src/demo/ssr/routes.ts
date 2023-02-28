import { any, array, number, object, string } from "superstruct";
import { observable } from "@trpc/server/observable";
import { router, procedure } from "../trpc";
import { merge, subscribe } from "./stores";

const routes = router({
  push: procedure.input(array(any())).mutation(({ input }) => merge(input)),
  pull: procedure
    .input(object({ version: number(), client: string() }))
    .subscription(({ input }) =>
      observable<any[]>(({ next }) => subscribe(["*"], next, input))
    ),
});

export { routes };
