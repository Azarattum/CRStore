import { createSignal, Index } from "solid-js";
import { object, string } from "superstruct";
import { database } from "$lib/solid";
import { crr, primary } from "$lib";

// ================ Define Schema ================
const items = object({ text: string() });
primary(items, "text");
crr(items);

const schema = object({ items });

// ================ Connect to DB ================
const { createStore } = database(schema, { name: "react.db" });

export const Component = () => {
  const [filter, setFilter] = createSignal("");
  const items = createStore(
    (db, filter) =>
      db
        .selectFrom("items")
        .where("text", "like", filter + "%")
        .selectAll(),
    {
      create(db, text: string) {
        return db.insertInto("items").values({ text }).execute();
      },
    },
    [filter],
  );

  function handleCreate(
    e: KeyboardEvent & { currentTarget: HTMLInputElement },
  ) {
    if (e.code === "Enter") items.create(e.currentTarget.value);
  }

  return (
    <>
      <ol>
        <Index each={items()}>{(x) => <li>{x().text}</li>}</Index>
      </ol>
      <input type="text" placeholder="Create" onKeyDown={handleCreate} />
      <input
        type="text"
        placeholder="Filter"
        onInput={(e) => setFilter(e.currentTarget.value)}
      />
    </>
  );
};
