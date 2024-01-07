<script lang="ts">
  import { database } from "$lib/svelte";
  import { onDestroy } from "svelte";
  import { schema } from "./schema";
  import { trpc } from "../client";
  import { sql } from "kysely";

  const { replicated, close } = database(schema, {
    name: "todo.db",
    push: trpc.todo.push.mutate,
    pull: trpc.todo.pull.subscribe,
  });
  onDestroy(close);

  const todos = replicated((db) => db.selectFrom("todos").selectAll(), {
    create(db, title: string, text: string) {
      const id = [...title].map((x) => x.charCodeAt(0)).join("");
      const todo = { id, title, text, completed: false };
      return db.insertInto("todos").values(todo).execute();
    },
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
    top(db) {
      return db.selectFrom("todos").selectAll().limit(1).executeTakeFirst();
    },
  });

  let title = "";
  let text = "";
  let top = "None";

  $: if ($todos) todos.top().then((x) => (top = x?.title || "None"));
</script>

<p>Top Item: {top}</p>
{#if $todos}
  <div>
    <input placeholder="Title" type="text" bind:value={title} />
    <input placeholder="Text" type="text" bind:value={text} />
    <button on:click={() => todos.create(title, text)}>+</button>
  </div>
  <ul>
    {#each $todos as todo}
      <li>
        <button
          on:click={() => todos.toggle(todo.id)}
          class="todo"
          class:done={todo.completed}
        >
          <h2>{todo.title}</h2>
          <p>{todo.text}</p>
        </button>
        <button on:click={() => todos.remove(todo.id)}>x</button>
      </li>
    {/each}
  </ul>
{:else}
  Loading...
{/if}

<style>
  li {
    display: flex;
    margin: 1rem;
    max-width: 40rem;
  }
  .todo {
    width: 100%;
  }
  .done {
    background-color: darkolivegreen;
    color: white;
  }
</style>
