import { builder, schema, zql } from "@effect-zero/example-data/zero";

export { builder, schema, zql };

export type DemoContext = { userId: string } | undefined;

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    schema: typeof schema;
    context: DemoContext;
  }
}
