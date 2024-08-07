# CRStore

Conflict-free replicated store. 

> WARNING: Still in development! Expect breaking changes!
>
> BREAKING (v0.20.0): Added support for React & Solid. For Svelte import `database` from `crstore/svelte`. Renamed `store` to `replicated`.
>
> BREAKING (v0.19.0): Updated `cr-sqlite` from v13 to v16. See [changelog](https://github.com/vlcn-io/cr-sqlite/releases)
> 
> BREAKING (v0.18.0): If you want to support [older browsers](https://caniuse.com/mdn-api_navigator_locks) consider adding [navigator.locks polyfill](https://www.npmjs.com/package/navigator.locks) to your project. CRStore does **not** ship it since `0.18.0`!

- ✨ Elegance of [Svelte](https://svelte.dev/) / [SolidJS](https://www.solidjs.com/) / [React](https://react.dev/)
- 💪 Power of [SQLite](https://www.sqlite.org/index.html)
- 🛡️ Safety with [Kysely](https://github.com/koskimas/kysely)
- ⚡ CRDTs powered by [cr-sqlite](https://github.com/vlcn-io/cr-sqlite)
- 🔮 Automagical schema using [superstruct](https://github.com/ianstormtaylor/superstruct)
- 🤝 First class [tRPC](https://github.com/trpc/trpc) support
- 🐇 Supports [bun:sqlite](https://bun.sh/docs/api/sqlite) (experimental)

Install `crstore` and `superstruct` (for automatic schema):
```sh
npm install crstore superstruct
```

## Using CRStore

To start using `CRStore` first you need to define a schema for your database. This is like a [Kysely schema](https://github.com/koskimas/kysely/blob/master/recipes/schemas.md), but defined with [superstruct](https://github.com/ianstormtaylor/superstruct), so we can have a runtime access to it. 
```ts
import { crr, primary } from "crstore";

// Struct that represents the table
const todos = object({
  id: string(),
  title: string(),
  text: string(),
  completed: boolean(),
});
crr(todos); // Register table with conflict-free replicated relations
primary(todos, "id"); // Define a primary key (can be multi-column)

const schema = object({ todos });
```

Now you can establish a database connection with your schema:
```ts
import { database } from "crstore/svelte";

const { replicated } = database(schema);
```
> Note, that this example uses Svelte version (`replicated`). For React `database` function will return `useReplica` and `createReplica` for SolidJS. Learn more how to use `CRStore` with these frameworks [here](./src/demo/frameworks/).

With the `replicated` function we can create arbitrary views to our database which are valid svelte stores. For example let's create a store that will have our entire `todos` table:
```ts
const todos = replicated((db) => db.selectFrom("todos").selectAll());
```

To mutate the data we can either call `.update` on the store or add built-in actions upon creation:
```ts
const todos = replicated((db) => db.selectFrom("todos").selectAll(), {
  // Define actions for your store
  toggle(db, id: string) {
    return db
      .updateTable("todos")
      .set({ completed: sql`NOT(completed)` })
      .where("id", "=", id)
      .execute();
  },
  remove(db, id: string) {
    return db.deleteFrom("todos").where("id", "=", id).execute();
  },
});

// Call an update manually
todos.update((db) => db.insertInto("todos").values({ ... }).execute());
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
const { replicated } = database(schema, {
  push: trpc.push.mutate,
  pull: trpc.pull.subscribe,
});
```

Then your server implementation would look something like this:
```ts
import { database } from "crstore";

const { subscribe, merge } = database(schema);
const { router, procedure } = initTRPC.create();

const app = router({
  push: procedure.input(any()).mutation(({ input }) => merge(input)),
  pull: procedure
    .input(object({ version: number(), client: string() }))
    .subscription(({ input }) =>
      observable(({ next }) => subscribe(["*"], next, input))
    ),
});
```

> If you are using `vite-node` to run your server, you should add `define: { "import.meta.env.SSR": false }` to your vite config file.

## Advanced Usage

### Depend on other stores

When creating a `crstore` you might want it to subscribe to some other stores. For example you can have a writable `query` store and a `search` crstore. Where `search` updates every time `query` updates. To do so you can use `.with(...stores)` syntax when creating a store. All the resolved dependencies will be passed to your SELECT callback.
```ts
import { database } from "crstore/svelte";
import { writable } from "svelte/store";

const { replicated } = database(schema);

const query = writable("hey");
const search = replicated.with(query)((db, query) => 
  db.selectFrom("todos").where("text", "=", query).selectAll()
);
```

### Specify custom paths

If needed you can specify custom paths to `better-sqlite3` binding, `crsqlite` extension and `crsqlite-wasm` binary. To do so, provide `path` option upon `database` initialization:
```ts
import { database } from "crstore/svelte";

const { replicated } = database(schema, {
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
import { database } from "crstore/svelte";

const { replicated } = database(schema, {
  name: "data/example.db"
});
```

### Specify a custom online checker

`push` and `pull` capabilities rely on checking current online status. When available `navigator.onLine` is used by default. You have an option to override it by providing a custom online function.
```ts
import { database } from "crstore/svelte";

const { replicated } = database(schema, {
  online: () => true // Always online
});
```
Note that this is only really needed if you use `pull` and `push` helpers. If your [server implementation](#connecting-with-trpc) uses `subscribe` and `merge` methods instead, the online checker is unnecessary (defaults to `false`).

### Apply updates without creating a store

Use can apply any updates right after you have initialized your database connection by using the `update` function. If there are any stores initialized, they will also be updated if you change any tables they depend on.
```ts
import { database } from "crstore";

const { update } = database(schema);
update((db) => db.insertInto("todos").values({ ... }));
```

### Access raw database connection

Use can access the raw database connection. This can sometime be useful for debugging. Note that any mutations you do directly from the connection **will not trigger any reactive updates**! To mutate data safely please use [the `update` function](#apply-updates-without-creating-a-store) instead.

```ts
import { database } from "crstore";

const { connection } = database(schema);
const db = await connection;

const data = await db.selectFrom("todos").selectAll().execute()
console.log(data);
```

### Nested JSON queries

`crstore` provides support for nested JSON queries via it's own [JSON Kysely plugin](src/lib/database/json.ts). You can see how it's used in practice be looking at the [library demo](src/demo/library/library.ts).
```ts
import { groupJSON } from "crstore";

const grouped = replicated((db) =>
  db
    .selectFrom("tracks")
    .leftJoin("artists", "tracks.artist", "artists.id")
    .leftJoin("albums", "tracks.album", "albums.id")
    .select([
      "albums.title as album",
      (qb) =>
        // Here we aggregate all the tracks for the album
        groupJSON(qb, {
          id: "tracks.id",
          title: "tracks.title",
          artist: "artists.title",
          album: "albums.title",
        }).as("tracks"),
    ])
    // `groupBy` is essential for the aggregation to work
    .groupBy("album")
);

$grouped[0] // ↓ The type is inferred from `json`
// {
//   album: string | null;
//   tracks: {
//     id: string;
//     title: string;
//     artist: string | null;
//     album: string | null;
//   }[]
// }
```

### Specify indexes in the schema
You can specify one or more indexes for your tables.

```ts
import { index } from "crstore";

const todos = object({
  id: string(),
  title: string(),
  text: string(),
  completed: boolean(),
});
index(todos, "title");
index(todos, "text", "completed"); // Multi-column index
```

### Define a fractional index for a table
`cr-sqlite` supports conflict free fractional indexing. To use them in `CRStore` first you should define table as ordered in your schema:

```ts
import { ordered } from "crstore";

const todos = object({
  id: string(),
  text: string(),
  completed: boolean(),
  collection: string(),
  order: string()
});
// Sort by 'order' column in each 'collection'
ordered(todos, "order", "collection");
```

Then you can append or prepend items by putting the exported constants as your order value.
```ts
import { APPEND, PREPEND } from "crstore";

db.insertInto("todos")
  .values({
    id: "4321",
    text: "Hello",
    completed: false,
    collection: "1234",
    order: APPEND,
  })
  .execute();
```

To move an item you should update the `{you_table}_fractindex` virtual table with the `after_id` value.
```ts
db
  .updateTable("todos_fractindex" as any)
  .set({ after_id: "2345" })
  .where("id", "=", "4321")
  .execute();
```

Check out the [sortable example](src/demo/sortable) for more details.

### Setup server side rendering
When defining your database set `ssr` option to `true`:
```ts
const { replicated, merge, subscribe } = database(schema, {
  ssr: true,
});
```

Add `+page.server.ts` file to preload your data with SvelteKit. You can call `.then` on a store to get a promise with its latest state (the `await` keyword would achieve the same effect). Pass down the value of your store to your page like this:
```ts
import type { PageServerLoad } from "./$types";
import { items } from "./stores";

export const load: PageServerLoad = async () => ({ ssr: await items });
```

In your `+page.svelte` you render the server-side data until client database is ready.
```svelte
<script lang="ts">
  import type { PageData } from "./$types";
  import { items } from "./stores";
  import { ready } from "$lib";

  export let data: PageData;
</script>

{#each ready($items) ? $items : data.ssr as item}
  <li>{item.data}</li>
{/each}
```

Check out the [ssr example](src/demo/ssr/) for complete implementation.

### Error handling
You can add an error handler to your database connection.
```ts
const { replicated } = database(schema, {
  error: (reason) => console.log(reason),
});
```

It will handle all the errors that happen during subscriber callbacks.
