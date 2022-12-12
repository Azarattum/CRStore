import { encode, decode, changes } from "../lib/database/schema";
import type { CRChange, Encoded } from "../lib/database/schema";
import { any, array, number, object, string } from "superstruct";
import { observable } from "@trpc/server/observable";
import { initTRPC } from "@trpc/server";
import { init } from "../lib/database";
import { Schema } from "./schema";
import EventEmitter from "events";

const emitter = new EventEmitter();
const db = await init("todo.db", Schema);

const { router: routes, procedure } = initTRPC.create();
const app = routes({
  pull: procedure
    .input(object({ version: number(), client: string() }))
    .subscription(async ({ input: { version, client } }) => {
      const changes = await db.changesSince(version, "!=", client).execute();

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

  push: procedure.input(array(any())).mutation(async ({ input }) => {
    const client = input[0]?.["site_id"];
    const decoded = input.map((x) => decode(x, "site_id")) as CRChange[];
    const version = await db.selectVersion().execute();
    await db.insertChanges(decoded).execute();
    const resolved = await db.changesSince(version).execute();
    emitter.emit("push", resolved, client);
  }),
});

export { app as router };
export type App = typeof app;
