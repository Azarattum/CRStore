import { object, string } from "superstruct";
import { crr, primary } from "../../lib";

const items = object({ text: string() });
primary(items, "text");
crr(items);

export const schema = object({ items });
