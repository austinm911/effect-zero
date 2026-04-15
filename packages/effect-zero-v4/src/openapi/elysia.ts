import { Elysia } from "elysia";
import {
  createOpenapiOperation,
  getOpenapiMutatorEntries,
  type OpenapiMutatorEntry,
  type OpenapiMutatorRegistry,
} from "../openapi.js";
import type { ReadonlyJSONValue } from "@rocicorp/zero";

export interface ElysiaZeroMutatorRunInput {
  readonly args: ReadonlyJSONValue | undefined;
  readonly name: string;
  readonly request: Request;
}

export interface ElysiaZeroMutatorRoutesOptions {
  /**
   * Adds `detail.mcp` to generated Elysia routes for route-discovery MCP
   * plugins. Tool names and descriptions still come from OpenAPI metadata:
   * `operationId`, `summary`, and `description`.
   *
   * A mutator can override this globally enabled behavior with `mcp: false`, or
   * opt in individually with `mcp: true`. MCP name and description overrides
   * from `mcp: { name, description }` are for framework-neutral tool
   * definitions; route-discovery plugins read the Elysia route metadata.
   */
  readonly mcp?: boolean;
  readonly name?: string;
  readonly prefix?: string;
  readonly registry: OpenapiMutatorRegistry<unknown>;
  run(input: ElysiaZeroMutatorRunInput): Promise<unknown> | unknown;
}

export function zeroMutatorRoutes(options: ElysiaZeroMutatorRoutesOptions) {
  const app = new Elysia({
    name: options.name ?? "effect-zero-openapi-mutators",
    prefix: options.prefix,
  });

  for (const entry of getOpenapiMutatorEntries(options.registry)) {
    const detail = createOpenapiOperation(entry, {
      includeRequestBody: false,
    }) as unknown as Record<string, unknown>;
    const mcp = resolveMcpRouteFlag(entry, options.mcp);

    if (mcp !== undefined) {
      detail.mcp = mcp;
    }

    app.post(
      entry.path,
      ({ body, request }) =>
        options.run({
          args: body as ReadonlyJSONValue | undefined,
          name: entry.name,
          request,
        }),
      {
        body: entry.argsSchema as never,
        detail: detail as never,
      },
    );
  }

  return app;
}

function resolveMcpRouteFlag(entry: OpenapiMutatorEntry, adapterMcp: boolean | undefined) {
  if (entry.mcp?.enabled === false) {
    return false;
  }

  if (entry.mcp?.enabled === true) {
    return true;
  }

  return adapterMcp;
}
