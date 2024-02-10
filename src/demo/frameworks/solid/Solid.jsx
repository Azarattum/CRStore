import { createSignal, Index } from "solid-js";
import { database } from "$lib/solid";
import { trpc } from "../../client";
import { schema } from "../schema";

const { createReplica } = database(schema, {
  name: "frameworks.db",
  push: trpc.frameworks.push.mutate,
  pull: trpc.frameworks.pull.subscribe,
});

export const Component = () => {
  const [filter, setFilter] = createSignal("");
  const items = createReplica(
    (db, filter) =>
      db
        .selectFrom("items")
        .where("text", "like", filter + "%")
        .selectAll(),
    {
      create(db, text ) {
        return db.insertInto("items").values({ text }).execute();
      },
    },
    [filter],
  );

  return (
    <>
      <h1>Solid</h1>
      <ol>
        <Index each={items()}>{(x) => <li>{x().text}</li>}</Index>
      </ol>
      <input type="text" placeholder="Create" onKeyDown={(e) => {
         if (e.code === "Enter") items.create(e.currentTarget.value);
      }} />
      <input
        type="text"
        placeholder="Filter"
        onInput={(e) => setFilter(e.currentTarget.value)}
      />
    </>
  );
};
