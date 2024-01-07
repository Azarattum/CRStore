import { any, number, object, string } from "superstruct";
import { observable } from "@trpc/server/observable";
import { router, procedure } from "../trpc";
import { database } from "../../lib";
import { schema } from "./schema";

const { subscribe, merge } = database(schema, { name: "data/frameworks.db" });

const routes = router({
  push: procedure.input(any()).mutation(({ input }) => merge(input)),
  pull: procedure
    .input(object({ version: number(), client: string() }))
    .subscription(({ input }) =>
      observable<any>(({ next }) => subscribe(["*"], next, input)),
    ),
});

export { routes };
