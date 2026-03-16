import { zql } from "../../zero/schema.ts";
import { z } from "zod";
import { defineMusicFixtureMutator } from "../context.ts";

export const removeCartItemArgs = z.object({
  albumId: z.string(),
});

export const remove = defineMusicFixtureMutator(removeCartItemArgs, async ({ args, ctx, tx }) => {
  if (!ctx) {
    throw new Error("Missing demo context");
  }

  const cartItem = await tx.run(
    zql.cartItem.where("userId", ctx.userId).where("albumId", args.albumId).one(),
  );

  if (!cartItem) {
    return;
  }

  await tx.mutate.cartItem.delete({
    albumId: cartItem.albumId,
    userId: cartItem.userId,
  });
});
