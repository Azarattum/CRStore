import { database } from "../../lib";
import { schema } from "./schema";
import { trpc } from "../client";
import { sql } from "kysely";

const { store } = database(schema, {
  name: "library.db",
  push: (changes) => trpc.library.push.mutate(changes),
  pull: (version, client, onData) =>
    trpc.library.pull.subscribe({ version, client }, { onData }).unsubscribe,
});

const all = store(
  (db) =>
    db
      .selectFrom("tracks")
      .innerJoin("artists", "tracks.artist", "artists.id")
      .innerJoin("albums", "tracks.album", "albums.id")
      .select([
        "tracks.id as id",
        "tracks.title as title",
        "artists.title as artist",
        "albums.title as album",
      ]),
  {
    add(db, title: string, artist: string, album: string) {
      const trackId = [...title].map((x) => x.charCodeAt(0)).join("");
      const artistId = [...artist].map((x) => x.charCodeAt(0)).join("");
      const albumId = [...album].map((x) => x.charCodeAt(0)).join("");

      return [
        db
          .insertInto("artists")
          .onConflict((oc) => oc.doNothing())
          .values({ id: artistId, title: artist }),
        db
          .insertInto("albums")
          .onConflict((oc) => oc.doNothing())
          .values({ id: albumId, title: album }),
        db
          .insertInto("tracks")
          .values({ id: trackId, title, artist: artistId, album: albumId }),
      ];
    },
  }
);

const artists = store((db) => db.selectFrom("artists").selectAll());

const grouped = store((db) =>
  db
    .selectFrom("tracks")
    .innerJoin("artists", "tracks.artist", "artists.id")
    .innerJoin("albums", "tracks.album", "albums.id")
    .select([
      "albums.title as album",
      /// This is quite ugly, should be reworked
      sql<string>`json_group_array(json_object(
        'id', tracks.id,
        'title', tracks.title,
        'artist', artists.title,
        'album', albums.title
      ))`.as("tracks"),
    ])
    .groupBy("album")
);

export { all, artists, grouped };
