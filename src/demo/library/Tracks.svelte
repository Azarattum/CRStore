<script lang="ts">
  export let tracks: {
    id: string;
    title: string;
    artist: string;
    album: string;
  }[] = [];
</script>

<thead>
  <th>Artist</th><th>Title</th><th>Album</th>
</thead>
<tbody>
  {#each tracks as track (track.id)}
    <tr>
      <td>{track.artist}</td><td>{track.title}</td><td>{track.album}</td>
    </tr>
  {/each}
</tbody>

<style>
  tr:nth-child(2n) {
    background-color: gainsboro;
  }

  td {
    padding: 4px;
  }

  tr {
    animation: blink 1s 1;
  }

  @keyframes blink {
    0% {
      background-color: red;
    }
  }
</style>
