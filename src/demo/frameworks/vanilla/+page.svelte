<script lang="ts">
  import { onMount } from "svelte";
  import { load } from "./vanilla";

  onMount(load);
</script>

<ol id="list"></ol>
<input type="text" placeholder="Create" id="create" />
<input type="text" placeholder="Filter" id="filter" />
