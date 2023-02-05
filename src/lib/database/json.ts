import type {
  PluginTransformResultArgs,
  PluginTransformQueryArgs,
  ExpressionBuilder,
  StringReference,
  SelectionNode,
  KyselyPlugin,
} from "kysely";
import type { ExtractTypeFromReferenceExpression } from "kysely/dist/cjs/parser/reference-parser";
import { sql } from "kysely";

type JSON<DB, TB extends keyof DB, OBJ> = {
  [K in keyof OBJ]: ExtractTypeFromReferenceExpression<DB, TB, OBJ[K]>;
};

function wrap<
  DB,
  TB extends keyof DB,
  OBJ extends Record<string, StringReference<DB, TB>>
>(wrapper: [string, string], kysely: ExpressionBuilder<DB, TB>, json: OBJ) {
  const entires = Object.entries(json).flatMap(([key, value]) => [
    sql.literal(key),
    kysely.ref(value),
  ]);

  type ObjectArray = JSON<DB, TB, OBJ>[];
  return sql`${sql.raw(wrapper[0])}${sql.join(entires)}${sql.raw(wrapper[1])}`
    .withPlugin({
      transformQuery({ node }: PluginTransformQueryArgs) {
        return { ...node, json: true };
      },
    } as any)
    .$castTo<ObjectArray>();
}

function jsonGroup<
  DB,
  TB extends keyof DB,
  OBJ extends Record<string, StringReference<DB, TB>>
>(kysely: ExpressionBuilder<DB, TB>, json: OBJ) {
  return wrap(["json_group_array(json_object(", "))"], kysely, json);
}

function json<
  DB,
  TB extends keyof DB,
  OBJ extends Record<string, StringReference<DB, TB>>
>(kysely: ExpressionBuilder<DB, TB>, json: OBJ) {
  return wrap(["json_object(", ")"], kysely, json);
}

function group<
  DB,
  TB extends keyof DB,
  OBJ extends Record<string, StringReference<DB, TB>>
>(kysely: ExpressionBuilder<DB, TB>, json: OBJ) {
  return wrap(["json_group_array(", ")"], kysely, json);
}

class JSONPlugin implements KyselyPlugin {
  #jsonNodes = new WeakMap<object, Set<string>>();

  transformQuery({ node, queryId }: PluginTransformQueryArgs) {
    if (node.kind !== "SelectQueryNode") return node;
    for (const selection of this.getSelections(node)) {
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
    result.rows.forEach((row) => this.parseObject(row, mapped));
    return result;
  }

  private getSelections(node: Record<string, any>) {
    const selections: SelectionNode[] = [];
    for (const key in node) {
      if (key === "selections" && Array.isArray(node[key])) {
        const nodes = node[key].filter((x: any) => x.kind === "SelectionNode");
        selections.push(...nodes);
      }
      if (typeof node[key] === "object") {
        selections.push(...this.getSelections(node[key]));
      }
    }
    return selections;
  }

  private parseObject(object: Record<string, any>, keys: Set<string>) {
    for (const key in object) {
      if (keys.has(key)) object[key] = JSON.parse(String(object[key]));
      if (typeof object[key] === "object") this.parseObject(object[key], keys);
    }
  }
}

export { json, group, jsonGroup, JSONPlugin };
