import { schema } from "../schema";
import { database } from "$lib";

export function load() {
  const { replica } = database(schema, { name: "frameworks.db" });

  const items = replica(
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
    [""],
  );

  const createElement = document.getElementById("create");
  createElement?.addEventListener("keydown", (e) => {
    if (e.code === "Enter") items.create((e.currentTarget as any).value);
  });

  const filterElement = document.getElementById("filter");
  filterElement?.addEventListener("input", (e) => {
    items.bind([(e.currentTarget as any).value]);
  });

  const listElement = document.getElementById("list")!;
  items.subscribe((items) => {
    listElement.innerHTML = "";
    items.forEach((x) => {
      const liElement = document.createElement("li");
      liElement.textContent = x.text;
      listElement.appendChild(liElement);
    });
  });
}
