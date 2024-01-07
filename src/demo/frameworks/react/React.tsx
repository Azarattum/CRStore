import React, { useCallback, useState } from "react";
import { database } from "$lib/react";
import { schema } from "../schema";

const { useReplica } = database(schema, { name: "frameworks.db" });

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
