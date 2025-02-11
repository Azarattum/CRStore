import { load as loadBun } from "./bun.js";
import { load as loadNode } from "./node.js";

export const load = process.versions.bun ? loadBun : loadNode;
