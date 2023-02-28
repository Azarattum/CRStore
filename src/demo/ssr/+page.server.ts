import type { PageServerLoad } from "./$types";
import { items } from "./stores";

export const load: PageServerLoad = async () => {
  const data = await items;
  return { data };
};
