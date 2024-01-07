import React, { useCallback, useState } from "react";
import { object, string } from "superstruct";
import { database } from "$lib/react";
import { crr, primary } from "$lib";

// ================ Define Schema ================
const items = object({ text: string() });
primary(items, "text");
crr(items);

const schema = object({ items });

// ================ Connect to DB ================
const { useReplica } = database(schema, { name: "react.db" });

export const Component: React.FC = () => {
  const [filter, setFilter] = useState("");
  const items = useReplica(
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

  const handleCreate = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.code === "Enter") items.create(e.currentTarget.value);
    },
    [],
  );

  return (
    <React.StrictMode>
      <ol>
        {items.map((x) => (
          <li key={x.text}>{x.text}</li>
        ))}
      </ol>
      <input type="text" placeholder="Create" onKeyDown={handleCreate} />
      <input
        type="text"
        value={filter}
        placeholder="Filter"
        onInput={(e) => setFilter(e.currentTarget.value)}
      />
    </React.StrictMode>
  );
};
