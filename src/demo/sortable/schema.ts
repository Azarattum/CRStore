import { number, object, string } from "superstruct";
import { crr, index, ordered, primary } from "../../lib";

const items = object({
  id: number(),
  data: string(),
  list: number(),
  order: string(),
});
crr(items);
primary(items, "id");
index(items, "list");
index(items, "order", "id");
ordered(items, "order", "list");

const lists = object({
  id: number(),
  title: string(),
});
crr(lists);
primary(lists, "id");

const schema = object({ items, lists });

export { schema };
