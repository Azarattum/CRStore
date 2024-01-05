import { changesSince, selectVersion } from "./operations";
import type { EncodedChanges, Operation } from "../types";
import type { Kysely } from "kysely";

const raf = globalThis.requestAnimationFrame || globalThis.setTimeout;
const error = Symbol("error");

function queue<S>(
  connection: Promise<Kysely<S>>,
  trigger?: (changes: EncodedChanges) => void,
) {
  const queue = new Map<object, Operation<[], unknown, S>>();
  let queueing: Promise<Map<object, unknown>> | undefined;

  async function dequeue() {
    if (queueing) return queueing;
    return (queueing = new Promise((resolve) =>
      raf(async () => {
        const db = await connection;
        const result = new Map<object, unknown>();
        await db.transaction().execute(async (trx: any) => {
          const current: any =
            trigger && (await selectVersion.bind(trx)().execute()).current;
          for (const [id, query] of queue.entries()) {
            const rows = await query(trx).catch((x) => ({ [error]: x }));
            result.set(id, rows);
          }
          trigger?.(await changesSince.bind(trx)(current).execute());
        });
        queue.clear();
        queueing = undefined;
        resolve(result);
      }),
    ));
  }

  return {
    enqueue<T extends any[], R>(
      id: object,
      operation: Operation<T, R, S>,
      ...args: T
    ) {
      queue.set(id, (db: Kysely<S>) => operation(db, ...args));
      return dequeue()
        .then((x) => x.get(id))
        .then((x) => {
          if (x && typeof x === "object" && error in x) throw x[error];
          else return x as R;
        });
    },
  };
}

export { queue };
