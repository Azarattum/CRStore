import { any, array, number, object, string } from "superstruct";
import { observable } from "@trpc/server/observable";
import { initTRPC } from "@trpc/server";
import { database } from "../lib";
import { Schema } from "./schema";

const { subscribe, merge } = database(Schema);
const { router, procedure } = initTRPC.create();

const app = router({
  push: procedure.input(array(any())).mutation(({ input }) => merge(input)),
  pull: procedure
    .input(object({ version: number(), client: string() }))
    .subscription(({ input }) =>
      observable<any[]>((emit) => {
        const send = (changes: any[], sender?: string) =>
          input.client !== sender && emit.next(changes);

        return subscribe(["*"], send, input);
      })
    ),
});

export { app as router };
export type App = typeof app;
