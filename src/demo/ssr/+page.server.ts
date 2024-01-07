import type { PageServerLoad } from "./$types";
import { items } from "./stores";

export const load: PageServerLoad = async () => ({ ssr: await items });
