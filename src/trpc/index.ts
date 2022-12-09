import { encode, type CRChange, type Encoded } from "../lib/database/schema";
import { any, array, number, object, string } from "superstruct";
import { observable } from "@trpc/server/observable";
import { init, decode } from "../lib/database";
import { Database } from "../routes/schema";
import { initTRPC } from "@trpc/server";
import EventEmitter from "events";

const emitter = new EventEmitter();
const db = await init("todo.db", Database);

const { router: routes, procedure } = initTRPC.create();
const app = routes({
  pull: procedure
    .input(object({ version: number(), client: string() }))
    .subscription(async ({ input: { version, client } }) => {
      const changes = await db.changesSince(version, client).execute();

      return observable<Encoded<CRChange>[]>((emit) => {
        const send = (changes: CRChange[], sender?: string) => {
          if (!changes.length || client === sender) return;
          emit.next(changes.map(encode<CRChange>));
        };

        send(changes);
        emitter.on("push", send);
        return () => emitter.off("push", send);
      });
    }),

  /// Add input validation
  push: procedure.input(array(any())).mutation(async ({ input }) => {
    const sender = input[0]?.site_id;
    const changes = input.map((x) => decode(x, "site_id")) as CRChange[];
    const resolved = await db.insertChanges(changes).execute();
    emitter.emit("push", resolved, sender);
  }),
});

export { app as router };
export type App = typeof app;
