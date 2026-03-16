import { add, addCartItemArgs } from "./add.ts";
import { remove, removeCartItemArgs } from "./remove.ts";

export { add, addCartItemArgs, remove, removeCartItemArgs };

export const cartMutatorDefinitions = {
  add,
  remove,
} as const;

export const cartMutatorValidators = {
  add: addCartItemArgs,
  remove: removeCartItemArgs,
} as const;
