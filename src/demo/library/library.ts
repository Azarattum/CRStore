import { database, json } from "../../lib";
import { schema } from "./schema";
import { trpc } from "../client";

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
      const id = [...title, ...artistId, ...albumId]
        .map((x) => x.charCodeAt(0))
        .join("");
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

const playlists = store((db) => db.selectFrom("playlists").selectAll(), {
  add(db, title: string) {
    const id = [...title].map((x) => x.charCodeAt(0)).join("");
    return db.insertInto("playlists").values({ id, title });
  },
  async link(db, track: string, playlist: string) {
    const id = Math.random().toString(36).slice(2);
    const max = await db
      .selectFrom("tracksByPlaylist")
      .where("playlist", "=", playlist)
      .select((db) => db.fn.max("order").as("order"))
      .executeTakeFirst();
    // Append "|" to make the next item
    const order = max ? (max.order || "") + "|" : "|";
    return db
      .insertInto("tracksByPlaylist")
      .values({ id, track, playlist, order })
      .execute();
  },
});

const grouped = store((db) =>
  db
    .selectFrom("tracks")
    .leftJoin("artists", "tracks.artist", "artists.id")
    .leftJoin("albums", "tracks.album", "albums.id")
    .select([
      "albums.title as album",
      (qb) =>
        json(qb, {
          id: "tracks.id",
          title: "tracks.title",
          artist: "artists.title",
          album: "albums.title",
        }).as("tracks"),
    ])
    .groupBy("album")
);

const organized = store((db) =>
  db
    .selectFrom((db) =>
      db
        .selectFrom("playlists")
        .innerJoin("tracksByPlaylist", "playlist", "playlists.id")
        .innerJoin("tracks", "track", "tracks.id")
        .leftJoin("artists", "tracks.artist", "artists.id")
        .leftJoin("albums", "tracks.album", "albums.id")
        .select([
          "playlists.title as playlist",
          "tracksByPlaylist.id as id",
          "tracks.title as title",
          "artists.title as artist",
          "albums.title as album",
        ])
        .orderBy("order")
        .as("data")
    )
    .select([
      "playlist",
      (qb) =>
        json(qb, {
          id: "id",
          title: "title",
          artist: "artist",
          album: "album",
        }).as("tracks"),
    ])
    .groupBy("playlist")
);

export { all, artists, albums, playlists, grouped, organized };
