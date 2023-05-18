import type {
  ExtractTypeFromReferenceExpression,
  PluginTransformResultArgs,
  PluginTransformQueryArgs,
  ExpressionBuilder,
  StringReference,
  SelectionNode,
  KyselyPlugin,
  Expression,
} from "kysely";
import { sql, AggregateFunctionNode, AggregateFunctionBuilder } from "kysely";

type Simplify<T> = T extends any[] | Date
  ? T
  : { [K in keyof T]: T[K] } & NonNullable<unknown>;

type JSON<DB, TB extends keyof DB, OBJ> = {
  [K in keyof OBJ]: NonNullable<
    ExtractTypeFromReferenceExpression<DB, TB, OBJ[K]>
  > &
    NonNullable<unknown>;
};

function json<
  DB,
  TB extends keyof DB,
  OBJ extends Record<string, StringReference<DB, TB> | Expression<any>>
>(kysely: ExpressionBuilder<DB, TB>, obj: OBJ) {
  const entires = Object.entries(obj).flatMap(([key, value]) => [
    sql.lit(key),
    typeof value === "string" ? kysely.ref(value) : value,
  ]);

  return sql`json_object(${sql.join(entires)})`
    .withPlugin({
      transformQuery({ node }: PluginTransformQueryArgs) {
        return { ...node, json: true };
      },
    } as any)
    .$castTo<Simplify<JSON<DB, TB, OBJ>>>();
}

function group<
  DB,
  TB extends keyof DB,
  EXP extends StringReference<DB, TB> | Expression<any>
>(kysely: ExpressionBuilder<DB, TB>, expr: EXP) {
  const reference =
    typeof expr === "string"
      ? kysely.ref(expr as any).toOperationNode()
      : expr.toOperationNode();

  const node = AggregateFunctionNode.create(
    "json_group_array" as any,
    reference as any
  );

  type O = Simplify<
    NonNullable<ExtractTypeFromReferenceExpression<DB, TB, EXP>>[]
  >;
  return new AggregateFunctionBuilder<DB, TB, O>({
    aggregateFunctionNode: { ...node, json: true } as any,
  });
}

function groupJSON<
  DB,
  TB extends keyof DB,
  OBJ extends Record<string, StringReference<DB, TB> | Expression<any>>
>(kysely: ExpressionBuilder<DB, TB>, obj: OBJ) {
  return group(kysely, json(kysely, obj));
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

export { json, group, groupJSON, JSONPlugin };
