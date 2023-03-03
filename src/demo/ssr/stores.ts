import { number, object, string } from "superstruct";
import { crr, database, primary } from "../../lib";
import { trpc } from "../client";

const schema = object({
  items: crr(primary(object({ id: number(), data: string() }), "id")),
});

const client = trpc as any; // Fixes circular referencing
const browser = "window" in globalThis;

export const { store, merge, subscribe } = database(schema, {
  ssr: true,
  name: "data/ssr.db",
  push: browser ? client.ssr.push.mutate : undefined,
  pull: browser ? client.ssr.pull.subscribe : undefined,
});

export const items = store((db) => db.selectFrom("items").selectAll(), {
  add(db, data: string) {
    const id = Math.random();
    return db.insertInto("items").values({ id, data }).execute();
  },
});