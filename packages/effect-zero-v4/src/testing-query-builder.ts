import { createBuilder, type Schema } from "@rocicorp/zero";

export function createV4TestingQueryBuilder<TSchema extends Schema>(schema: TSchema) {
  return createBuilder(schema);
}
