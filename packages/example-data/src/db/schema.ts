import { relations } from "drizzle-orm";
import { bigint, index, integer, pgTable, primaryKey, varchar } from "drizzle-orm/pg-core";

export const artist = pgTable(
  "artist",
  {
    id: varchar().primaryKey(),
    name: varchar().notNull(),
    sortName: varchar("sort_name").notNull(),
    type: varchar(),
    popularity: integer(),
  },
  (table) => [
    index("artist_name_idx").on(table.name),
    index("artist_popularity_idx").on(table.popularity),
  ],
);

export const album = pgTable(
  "album",
  {
    id: varchar().primaryKey(),
    artistId: varchar("artist_id")
      .notNull()
      .references(() => artist.id, { onDelete: "cascade" }),
    title: varchar().notNull(),
    year: integer(),
  },
  (table) => [index("album_artist_id_idx").on(table.artistId)],
);

export const cartItem = pgTable(
  "cart_item",
  {
    userId: varchar("user_id").notNull(),
    albumId: varchar("album_id")
      .notNull()
      .references(() => album.id, { onDelete: "cascade" }),
    addedAt: bigint("added_at", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.albumId] }),
    index("cart_item_user_id_idx").on(table.userId),
    index("cart_item_album_id_idx").on(table.albumId),
  ],
);

export const artistRelations = relations(artist, ({ many }) => ({
  albums: many(album),
}));

export const albumRelations = relations(album, ({ many, one }) => ({
  artist: one(artist, {
    fields: [album.artistId],
    references: [artist.id],
  }),
  cartItems: many(cartItem),
}));

export const cartItemRelations = relations(cartItem, ({ one }) => ({
  album: one(album, {
    fields: [cartItem.albumId],
    references: [album.id],
  }),
}));
