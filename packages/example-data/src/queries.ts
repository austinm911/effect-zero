import { defineQueries, defineQuery, type Query } from "@rocicorp/zero";
import { z } from "zod";
import { zql } from "./zero/schema.ts";

const ARTIST_LIST_LIMIT = 12;

const artistArgsSchema = z.object({
  artistId: z.string().optional(),
});

const artistListArgsSchema = z.object({
  limit: z.number().default(ARTIST_LIST_LIMIT),
  search: z.string().optional(),
});

export type MusicFixtureContext = { userId: string } | undefined;

export const queries = defineQueries({
  getArtist: defineQuery(artistArgsSchema, ({ args, ctx }) =>
    buildArtistQuery(args, ctx as MusicFixtureContext),
  ),
  getCartItems: defineQuery(({ ctx }) => buildCartItemsQuery(ctx as MusicFixtureContext)),
  listArtists: defineQuery(artistListArgsSchema, ({ args }) => buildArtistListQuery(args)),
});

function authedCartItems(query: Query<"cartItem">, ctx: MusicFixtureContext) {
  return query.where("userId", ctx?.userId ?? "");
}

export function buildArtistQuery(args: z.infer<typeof artistArgsSchema>, ctx: MusicFixtureContext) {
  return zql.artist
    .where("id", args.artistId ?? "")
    .related("albums", (album) =>
      album
        .orderBy("year", "desc")
        .related("cartItems", (cartItem) => authedCartItems(cartItem, ctx)),
    )
    .one();
}

export function buildCartItemsQuery(ctx: MusicFixtureContext) {
  return authedCartItems(zql.cartItem, ctx)
    .orderBy("addedAt", "desc")
    .related("album", (album) => album.one().related("artist", (artist) => artist.one()));
}

export function buildArtistListQuery(args: z.infer<typeof artistListArgsSchema>) {
  return zql.artist
    .where("name", "ILIKE", `%${args.search?.trim() ?? ""}%`)
    .orderBy("popularity", "desc")
    .limit(args.limit);
}
