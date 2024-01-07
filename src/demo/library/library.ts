import { database } from "../../lib/svelte";
import { groupJSON } from "../../lib";
import { schema } from "./schema";
import { trpc } from "../client";

const { replicated } = database(schema, {
  name: "library.db",
  push: trpc.library.push.mutate,
  pull: trpc.library.pull.subscribe,
});

const all = replicated(
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
        .values({ id, title, artist: artistId, album: albumId })
        .execute();
    },
  },
);

const artists = replicated((db) => db.selectFrom("artists").selectAll(), {
  add(db, title: string) {
    const id = [...title].map((x) => x.charCodeAt(0)).join("");
    return db.insertInto("artists").values({ id, title }).execute();
  },
});

const albums = replicated((db) => db.selectFrom("albums").selectAll(), {
  add(db, title: string) {
    const id = [...title].map((x) => x.charCodeAt(0)).join("");
    return db.insertInto("albums").values({ id, title }).execute();
  },
});

const playlists = replicated((db) => db.selectFrom("playlists").selectAll(), {
  add(db, title: string) {
    const id = [...title].map((x) => x.charCodeAt(0)).join("");
    return db.insertInto("playlists").values({ id, title }).execute();
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

const grouped = replicated((db) =>
  db
    .selectFrom("tracks")
    .leftJoin("artists", "tracks.artist", "artists.id")
    .leftJoin("albums", "tracks.album", "albums.id")
    .select([
      "albums.title as album",
      (qb) =>
        groupJSON(qb, {
          id: "tracks.id",
          title: "tracks.title",
          artist: "artists.title",
          album: "albums.title",
        }).as("tracks"),
    ])
    .groupBy("album"),
);

const organized = replicated((db) =>
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
        .as("data"),
    )
    .select([
      "playlist",
      (qb) =>
        groupJSON(qb, {
          id: "id",
          title: "title",
          artist: "artist",
          album: "album",
        }).as("tracks"),
    ])
    .groupBy("playlist"),
);

export { all, artists, albums, playlists, grouped, organized };
