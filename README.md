# CRStore

Conflict-free replicated svelte store. 

> WARNING: Still in development! Expect breaking changes!

- ✨ Elegance of [Svelte](https://svelte.dev/)
- 💪 Power of [SQLite](https://www.sqlite.org/index.html)
- 🛡️ Safety with [Kysely](https://github.com/koskimas/kysely)
- ⚡ CRDTs powered by [cr-sqlite](https://github.com/vlcn-io/cr-sqlite)
- 🔮 Automagical schema using [superstruct](https://github.com/ianstormtaylor/superstruct)
- 🤝 First class [tRPC](https://github.com/trpc/trpc) support

## Using CRStore

To start using `CRStore` first you need to define a schema for your database. This is like a [Kysely schema](https://github.com/koskimas/kysely/blob/master/recipes/schemas.md), but defined with [superstruct](https://github.com/ianstormtaylor/superstruct), so we can have a runtime access to it. 
```ts
// These helpers allow us to define primary keys on columns
//  and enable conflict-free replicated relations on tables
import { crr, primary } from "crstore";

const Todos = object({
  id: primary(string()),
  title: string(),
  text: string(),
  completed: boolean(),
});

const Database = object({ 
  todos: crr(Todos) 
});
```

Now you can create a store. You have to specify the table for it to reflect as well as the database schema.
```ts
const todos = crstore("todos", Database);
```

When you want to make changes, you can call the `.update` method on the store. In the callback you will be provided with `Kysely` instance which already has types for your schema. That way you can safely update your database. Let's make functions to create and remove todos:
```ts
function create(title: string, text: string) {
  todos.update((db) => {
    const id = Math.random().toString(36).slice(2);
    const todo = { id, title, text, completed: false };
    return db.insertInto("todos").values(todo).execute();
  });
}

function remove(id: string) {
  todos.update((db) => db.deleteFrom("todos").where("id", "=", id).execute());
}
```

The value of your store is a JavaScript object where keys are you `PRIMARY KEY` and values are your rows. Note that the database loads asynchronously, so the store's data will not be available immediately. We might want to wrap our todos in an `if` block to properly show the loading state like so:
```svelte
{#if $todos}
  {#each Object.values($todos) as todo}
    <h2>{todo.title}</h2>
    <p>{todo.text}</p>
  {/each}
{:else}
  Loading...
{/if}
```

## Connecting with tRPC

You can provide custom handlers for your network layer in a store. `push` method is called when you make changes locally that need to be synchronized. `pull` is called when `crstore` wants to subscribe to any changes coming from the network. Let's say you have a `push` [tRPC mutation](https://trpc.io/docs/quickstart) and a `pull` [tRPC subscription](https://trpc.io/docs/subscriptions) then you can use them like so when creating a store:
```ts
const todos = crstore("todos", Database, {
  push: (changes) => trpc.push.mutate(changes),
  pull: (version, client, onData) =>
    trpc.pull.subscribe({ version, client }, { onData }).unsubscribe,
});
```

Then your server implementation would look something like this:
```ts
import { encode, decode, changes } from "crstore/database/schema";
import type { CRChange, Encoded } from "crstore/database/schema";
import { init } from "crstore/database";

const emitter = new EventEmitter();
const db = await init("todo.db", Database);

const { router, procedure } = initTRPC.create();
const app = router({
  pull: procedure
    .input(object({ version: number(), client: string() }))
    .subscription(async ({ input: { version, client } }) => {
      // Get changes for a client when it first subscribes
      const changes = await db.changesSince(version, client).execute();

      return observable<Encoded<CRChange>[]>((emit) => {
        const send = (changes: CRChange[], sender?: string) => {
          // Don't emit empty changes or changes from yourself
          if (!changes.length || client === sender) return;
          emit.next(changes.map(encode<CRChange>));
        };

        // Immediately send current changes
        send(changes);
        // Send changes whenever someone else pushes them
        emitter.on("push", send);
        return () => emitter.off("push", send);
      });
    }),

  // `changes(Database)` is an automagical validator that only allows changes
  //    on CRR tables in the database schema and verifies column names
  push: procedure.input(changes(Database)).mutation(async ({ input }) => {
    // Identify the owner on the changes
    const sender = input[0]?.site_id;
    // Decode string to binary data
    const changes = input.map((x) => decode(x, "site_id")) as CRChange[];
    // Apply changes to the database and get resolved deltas
    const resolved = await db.insertChanges(changes).execute();
    // Emit resolved changes for everyone to receive
    emitter.emit("push", resolved, sender);
  }),
});
```