import { z } from "zod";
import { defineMusicFixtureMutator } from "../context.ts";

export const removeCartItemArgs = z.object({
  albumId: z.string(),
});

export const remove = defineMusicFixtureMutator(removeCartItemArgs, async ({ args, ctx, tx }) => {
  if (!ctx) {
    throw new Error("Missing demo context");
  }

  await tx.mutate.cartItem.delete({
    albumId: args.albumId,
    userId: ctx.userId,
  });
});
