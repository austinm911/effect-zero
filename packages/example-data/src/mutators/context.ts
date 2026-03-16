import type { Schema as MusicFixtureSchema } from "../zero/schema.ts";
import {
  defineMutatorWithType,
  type MutatorDefinition,
  type ServerTransaction,
  type Transaction,
} from "@rocicorp/zero";

export type MusicFixtureZeroContext = { userId: string } | undefined;
export type MusicFixtureZeroSchema = MusicFixtureSchema;

export type MusicFixtureTransaction<TWrappedTransaction = unknown> = Transaction<
  MusicFixtureZeroSchema,
  TWrappedTransaction
>;

export type MusicFixtureServerTransaction<TWrappedTransaction = unknown> = ServerTransaction<
  MusicFixtureZeroSchema,
  TWrappedTransaction
>;

export type MusicFixtureMutatorDefinition<
  TInput extends import("@rocicorp/zero").ReadonlyJSONValue | undefined,
  TOutput extends import("@rocicorp/zero").ReadonlyJSONValue | undefined = TInput,
  TWrappedTransaction = unknown,
> = MutatorDefinition<TInput, TOutput, MusicFixtureZeroContext, TWrappedTransaction>;

export type DefineMusicFixtureMutator = ReturnType<
  typeof defineMutatorWithType<MusicFixtureZeroSchema, MusicFixtureZeroContext>
>;

export const defineMusicFixtureMutator: DefineMusicFixtureMutator = defineMutatorWithType<
  MusicFixtureZeroSchema,
  MusicFixtureZeroContext
>();
