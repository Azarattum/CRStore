import { crr, primary } from "$lib";
import { object, string } from "superstruct";

const items = object({ text: string() });
primary(items, "text");
crr(items);

export const schema = object({ items });
