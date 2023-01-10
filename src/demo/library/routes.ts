import { any, array, number, object, string } from "superstruct";
import { observable } from "@trpc/server/observable";
import { router, procedure } from "../trpc";
import { database } from "../../lib";
import { schema } from "./schema";

const { subscribe, merge } = database(schema, { name: "data/library.db" });

const routes = router({
  push: procedure.input(array(any())).mutation(({ input }) => merge(input)),
  pull: procedure
    .input(object({ version: number(), client: string() }))
    .subscription(({ input }) =>
      observable<any[]>(({ next }) => subscribe(["*"], next, input))
    ),
});

export { routes };
