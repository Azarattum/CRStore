import { number, object, string } from "superstruct";
import { crr, database, primary } from "../../lib";
import { trpc } from "../client";

const schema = object({
  items: crr(primary(object({ id: number(), data: string() }), "id")),
});

// Only define `pull` and `push` client-side
const sync =
  import.meta.env?.SSR !== false
    ? {}
    : {
        push: (changes: any[]) => trpc.ssr.push.mutate(changes),
        pull: (version: number, client: string, onData: any): any =>
          trpc.ssr.pull.subscribe({ version, client }, { onData }).unsubscribe,
      };

export const { store, merge, subscribe } = database(schema, {
  name: "data/ssr.db",
  ...sync,
});

export const items = store((db) => db.selectFrom("items").selectAll(), {
  add(db, data: string) {
    const id = Math.random();
    return db.insertInto("items").values({ id, data }).execute();
  },
});
