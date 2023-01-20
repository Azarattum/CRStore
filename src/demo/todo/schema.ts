import { boolean, object, string } from "superstruct";
import { crr, primary } from "../../lib";

const todos = object({
  id: string(),
  title: string(),
  text: string(),
  completed: boolean(),
});
crr(todos);
primary(todos, "id");

const schema = object({ todos });

export { schema };
