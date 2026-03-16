import { z } from "zod";
import { defineMusicFixtureMutator } from "../context.ts";

export const addCartItemArgs = z.object({
  addedAt: z.number(),
  albumId: z.string(),
});

export const add = defineMusicFixtureMutator(addCartItemArgs, async ({ args, ctx, tx }) => {
  if (!ctx) {
    throw new Error("Missing demo context");
  }

  await tx.mutate.cartItem.upsert({
    addedAt: tx.location === "client" ? args.addedAt : Date.now(),
    albumId: args.albumId,
    userId: ctx.userId,
  });
});
