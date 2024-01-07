import { object, string } from "superstruct";
import { database } from "../../lib/svelte";
import { crr, primary } from "../../lib";
import { trpc } from "../client";

const schema = object({
  items: crr(primary(object({ id: string(), data: string() }), "id")),
});

const client = trpc as any; // Fixes circular referencing
const browser = "window" in globalThis;

export const { replicated, merge, subscribe } = database(schema, {
  ssr: true,
  name: "data/ssr.db",
  push: browser ? client.ssr.push.mutate : undefined,
  pull: browser ? client.ssr.pull.subscribe : undefined,
});

export const items = replicated((db) => db.selectFrom("items").selectAll(), {
  add(db, data: string) {
    const id = Math.random().toString(36).slice(2);
    return db.insertInto("items").values({ id, data }).execute();
  },
});
