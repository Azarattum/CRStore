<script lang="ts">
  import { Database } from "./schema";
  import { trpc } from "./client";
  import { crstore } from "$lib";
  import { sql } from "kysely";

  const todos = crstore("todos", Database, {
    push: (changes) => trpc.push.mutate(changes),
    pull: (version, client, onData) =>
      trpc.pull.subscribe({ version, client }, { onData }).unsubscribe,
  });

  function create() {
    todos.update((db) => {
      const id = Math.random().toString(36).slice(2);
      const todo = { id, title, text, completed: false };
      return db.insertInto("todos").values(todo).execute();
    });
  }

  function toggle(id: string) {
    todos.update((db) =>
      db
        .updateTable("todos")
        .set({ completed: sql`NOT(completed)` })
        .where("id", "=", id)
        .execute()
    );
  }

  function remove(id: string) {
    todos.update((db) => db.deleteFrom("todos").where("id", "=", id).execute());
  }

  let title = "";
  let text = "";
</script>

{#if $todos}
  <div>
    <input placeholder="Title" type="text" bind:value={title} />
    <input placeholder="Text" type="text" bind:value={text} />
    <button on:click={() => create()}>+</button>
  </div>
  <ul>
    {#each Object.values($todos) as todo}
      <li>
        <button
          on:click={() => toggle(todo.id)}
          class="todo"
          class:done={todo.completed}
        >
          <h2>{todo.title}</h2>
          <p>{todo.text}</p>
        </button>
        <button on:click={() => remove(todo.id)}>x</button>
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
