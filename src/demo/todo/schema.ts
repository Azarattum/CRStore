import { boolean, object, string } from "superstruct";
import { crr, primary } from "../../lib";

const Todos = object({
  id: primary(string()),
  title: string(),
  text: string(),
  completed: boolean(),
});

const Schema = object({ todos: crr(Todos) });

export { Schema };
