import * as z from "zod";
import {
  defineOpenapiMutator as defineStandardOpenapiMutator,
  defineOpenapiMutatorWithType as defineStandardOpenapiMutatorWithType,
  type DefineOpenapiMutatorInput,
  type InferOpenapiSchemaInput,
  type InferOpenapiSchemaOutput,
  type OpenapiMutatorDefinition,
} from "../openapi.js";
import type { ReadonlyJSONValue, Schema as ZeroSchema } from "@rocicorp/zero";
import type { StandardSchemaV1 } from "@standard-schema/spec";

type ZodStandardSchema = z.ZodType & StandardSchemaV1<any, any>;

export type DefineZodOpenapiMutatorInput<
  TValidator extends ZodStandardSchema,
  TContext,
  TWrappedTransaction,
  TSchema extends ZeroSchema = ZeroSchema,
> = Omit<
  DefineOpenapiMutatorInput<TValidator, TContext, TWrappedTransaction, TSchema>,
  "jsonSchema"
>;

export function defineOpenapiMutator<
  TValidator extends ZodStandardSchema,
  TContext = unknown,
  TWrappedTransaction = unknown,
>(
  input: DefineZodOpenapiMutatorInput<TValidator, TContext, TWrappedTransaction>,
): OpenapiMutatorDefinition<
  InferOpenapiSchemaInput<TValidator>,
  InferOpenapiSchemaOutput<TValidator>,
  TContext,
  TWrappedTransaction,
  TValidator
> {
  return defineStandardOpenapiMutator({
    ...input,
    jsonSchema: (schema) => z.toJSONSchema(schema),
  });
}

export function defineOpenapiMutatorWithType<
  TSchema extends ZeroSchema,
  TContext,
  TWrappedTransaction,
>() {
  const define = defineStandardOpenapiMutatorWithType<TSchema, TContext, TWrappedTransaction>();

  return function defineTypedZodOpenapiMutator<TValidator extends ZodStandardSchema>(
    input: DefineZodOpenapiMutatorInput<TValidator, TContext, TWrappedTransaction, TSchema>,
  ) {
    return define({
      ...input,
      jsonSchema: (schema) => z.toJSONSchema(schema),
    });
  };
}

export type { ReadonlyJSONValue };
