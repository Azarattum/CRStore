# CRStore

Conflict-free replicated svelte store. 

> WARNING: Still in development! Expect breaking changes!

- ✨ Elegance of [Svelte](https://svelte.dev/)
- 💪 Power of [SQLite](https://www.sqlite.org/index.html)
- 🛡️ Safety with [Kysely](https://github.com/koskimas/kysely)
- ⚡ CRDTs powered by [cr-sqlite](https://github.com/vlcn-io/cr-sqlite)
- 🔮 Automagical schema using [superstruct](https://github.com/ianstormtaylor/superstruct)
- 🤝 First class [tRPC](https://github.com/trpc/trpc) support
- 🐇 Supports [bun:sqlite](https://github.com/oven-sh/bun#bunsqlite-sqlite3-module) (experimental)

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

const Schema = object({ 
  todos: crr(Todos) 
});
```

Now you can establish a database connection with your schema:
```ts
import { database } from "crstore";

const { store } = database(Schema);
```

With the `store` function we can create arbitrary views to our database which are valid svelte stores. For example let's create a store that will have our entire `todos` table:
```ts
const todos = store((db) => db.selectFrom("todos").selectAll());
```

To mutate the data we can either call `.update` on the store or add built-in actions upon creation:
```ts
const todos = store((db) => db.selectFrom("todos").selectAll(), {
  // Define actions for your store
  toggle(db, id: string) {
    return db
      .updateTable("todos")
      .set({ completed: sql`NOT(completed)` })
      .where("id", "=", id);
  },
  remove(db, id: string) {
    return db.deleteFrom("todos").where("id", "=", id);
  },
});

// Call an update manually
todos.update((db) => db.insertInto("todos").values({ ... }));
// Call an action
todos.toggle("id");
```

We can simple iterate the store to render the results:
> Note that the database loads asynchronously, so the store will contain an empty array util it loads.
```svelte
{#each $todos as todo}
  <h2>{todo.title}</h2>
  <p>{todo.text}</p>
{/each}
```

This we dynamically react to all the changes in our database even if we make them from a different store. Each store we create reacts only to changes in tables we have selected from.

## Connecting with tRPC

You can provide custom handlers for your network layer upon initialization. `push` method is called when you make changes locally that need to be synchronized. `pull` is called when `crstore` wants to subscribe to any changes coming from the network. Let's say you have a `push` [tRPC mutation](https://trpc.io/docs/quickstart) and a `pull` [tRPC subscription](https://trpc.io/docs/subscriptions) then you can use them like so when connection to a database:
```ts
const { store } = database(Schema, {
  push: (changes) => trpc.push.mutate(changes),
  pull: (version, client, onData) =>
    trpc.pull.subscribe({ version, client }, { onData }).unsubscribe,
});
```

Then your server implementation would look something like this:
```ts
import { database } from "crstore";

const { subscribe, merge } = database(Schema);
const { router, procedure } = initTRPC.create();

const app = router({
  push: procedure.input(array(any())).mutation(({ input }) => merge(input)),
  pull: procedure
    .input(object({ version: number(), client: string() }))
    .subscription(({ input }) =>
      observable<any[]>((emit) => {
        const send = (changes: any[], sender?: string) =>
          input.client !== sender && emit.next(changes);

        return subscribe(["*"], send, input);
      })
    ),
});
```

## Advanced Usage

### Depend on other stores

When creating a `crstore` you might want it to subscribe to some other stores. For example you can have a writable `query` store and a `search` crstore. Where `search` updates every time `query` updates. To do so you can use `.with(...stores)` syntax when creating a store. All the resolved dependencies will be passed to your SELECT callback.
```ts
import { writable } from "svelte/store";
import { database } from "crstore";

const { store } = database(Schema);

const query = writable("hey");
const search = store.with(query)((db, query) => 
  db.selectFrom("todos").where("text", "=", query).selectAll()
);
```

### Specify custom paths

If needed you can specify custom paths to `better-sqlite3` binding, `crsqlite` extension and `wa-crsqlite` wasm binary. To do so, provide `path` option upon `database` initialization:
```ts
import { database } from "crstore";

const { store } = database(Schema, {
  // These are the default values:
  paths: {
    wasm: "/sqlite.wasm",
    extension: "node_modules/@vlcn.io/crsqlite/build/Release/crsqlite.node",
    binding: undefined,
  }
});
```

### Specify database name

If you need to manage multiple databases you can specify `name` database option. This will be used as a filename on a server or a VFS path on a client.
```ts
import { database } from "crstore";

const { store } = database(Schema, {
  name: "data/example.db"
});
```

### Specify a custom online checker

`push` and `pull` capabilities rely on checking current online status. When available `navigator.onLine` is used by default. You have an option to override it by providing a custom online function.
```ts
import { database } from "crstore";

const { store } = database(Schema, {
  online: () => true // Always online
});
```
Note, that this is only really needed if you use `pull` and `push` helpers. If your server implementation uses `subscribe` and `merge` methods instead, the online checker is unnecessary (defaults to `false`).