import type {
  PluginTransformResultArgs,
  PluginTransformQueryArgs,
  ExpressionBuilder,
  StringReference,
  KyselyPlugin,
} from "kysely";
import type { ExtractTypeFromReferenceExpression } from "kysely/dist/cjs/parser/reference-parser";
import { sql } from "kysely";

type JSON<DB, TB extends keyof DB, OBJ> = {
  [K in keyof OBJ]: ExtractTypeFromReferenceExpression<DB, TB, OBJ[K]>;
};

function json<
  DB,
  TB extends keyof DB,
  OBJ extends Record<string, StringReference<DB, TB>>
>(kysely: ExpressionBuilder<DB, TB>, json: OBJ) {
  const entires = Object.entries(json).flatMap(([key, value]) => [
    sql.literal(key),
    kysely.ref(value),
  ]);

  type ObjectArray = JSON<DB, TB, OBJ>[];
  return sql`json_group_array(json_object(${sql.join(entires)}))`
    .withPlugin({
      transformQuery({ node }: PluginTransformQueryArgs) {
        return { ...node, json: true };
      },
    } as any)
    .castTo<ObjectArray>();
}

class JSONPlugin implements KyselyPlugin {
  #jsonNodes = new WeakMap<object, Set<string>>();

  transformQuery({ node, queryId }: PluginTransformQueryArgs) {
    if (node.kind !== "SelectQueryNode") return node;
    if (!node.selections) return node;

    for (const selection of node.selections) {
      const target = selection.selection;
      if (target.kind !== "AliasNode") continue;
      if (!("json" in target.node)) continue;
      if (target.alias.kind !== "IdentifierNode") continue;
      if (!("name" in target.alias)) continue;
      if (typeof target.alias.name !== "string") continue;

      const mapped = this.#jsonNodes.get(queryId) || new Set();
      mapped.add(target.alias.name);
      this.#jsonNodes.set(queryId, mapped);
    }
    return node;
  }

  async transformResult({ result, queryId }: PluginTransformResultArgs) {
    if (!Array.isArray(result.rows)) return result;
    const mapped = this.#jsonNodes.get(queryId);
    if (!mapped) return result;

    result.rows.forEach((row) => {
      for (const key in row) {
        if (mapped?.has(key)) row[key] = JSON.parse(String(row[key]));
      }
    });

    return result;
  }
}

export { json, JSONPlugin };
