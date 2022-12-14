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
      .leftJoin("artists", "tracks.artist", "artists.id")
      .leftJoin("albums", "tracks.album", "albums.id")
      .select([
        "tracks.id as id",
        "tracks.title as title",
        "artists.title as artist",
        "albums.title as album",
      ]),
  {
    add(db, title: string, artistId: string, albumId: string) {
      const id = [...title].map((x) => x.charCodeAt(0)).join("");
      return db
        .insertInto("tracks")
        .values({ id, title, artist: artistId, album: albumId });
    },
  }
);

const artists = store((db) => db.selectFrom("artists").selectAll(), {
  add(db, title: string) {
    const id = [...title].map((x) => x.charCodeAt(0)).join("");
    return db.insertInto("artists").values({ id, title });
  },
});

const albums = store((db) => db.selectFrom("albums").selectAll(), {
  add(db, title: string) {
    const id = [...title].map((x) => x.charCodeAt(0)).join("");
    return db.insertInto("albums").values({ id, title });
  },
});

const grouped = store((db) =>
  db
    .selectFrom("tracks")
    .leftJoin("artists", "tracks.artist", "artists.id")
    .leftJoin("albums", "tracks.album", "albums.id")
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

export { all, artists, albums, grouped };
