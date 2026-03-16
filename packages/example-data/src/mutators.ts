import { defineMutators } from "@rocicorp/zero";
import { cartMutatorDefinitions, cartMutatorValidators } from "./mutators/cart/index.ts";

export { cartMutatorDefinitions, cartMutatorValidators };
export * from "./mutators/context.ts";

export const mutatorDefinitions = {
  cart: cartMutatorDefinitions,
} as const;

export const mutatorValidators = {
  cart: cartMutatorValidators,
} as const;

export const mutators = defineMutators(mutatorDefinitions);
