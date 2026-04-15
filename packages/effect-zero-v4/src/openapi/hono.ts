import { Hono } from "hono";
import {
  getOpenapiMutatorEntries,
  joinPath,
  validateOpenapiMutatorArgs,
  type OpenapiMutatorRegistry,
} from "../openapi.js";
import type { ReadonlyJSONValue } from "@rocicorp/zero";

export interface HonoZeroMutatorRunInput {
  readonly args: ReadonlyJSONValue | undefined;
  readonly name: string;
  readonly request: Request;
}

export interface HonoZeroMutatorRoutesOptions {
  readonly prefix?: string;
  readonly registry: OpenapiMutatorRegistry<unknown>;
  readonly validateArgs?: boolean;
  run(input: HonoZeroMutatorRunInput): Promise<unknown> | unknown;
}

export function zeroMutatorRoutes(options: HonoZeroMutatorRoutesOptions) {
  const app = new Hono();
  const shouldValidateArgs = options.validateArgs ?? true;

  for (const entry of getOpenapiMutatorEntries(options.registry)) {
    app.post(joinPath(options.prefix ?? "", entry.path), async (context) => {
      const rawArgs = await context.req.json().catch(() => undefined);
      let args = rawArgs as ReadonlyJSONValue | undefined;

      if (shouldValidateArgs) {
        const result = await validateOpenapiMutatorArgs(entry, args);

        if (!result.ok) {
          return context.json(
            {
              error: "Invalid request body.",
              issues: result.issues,
            },
            400,
          );
        }

        args = result.args;
      }

      const response = await options.run({
        args,
        name: entry.name,
        request: context.req.raw,
      });

      return toJsonResponse(context, response);
    });
  }

  return app;
}

function toJsonResponse(
  context: { json: (value: never, status?: number) => Response },
  response: unknown,
) {
  if (response instanceof Response) {
    return response;
  }

  return context.json((response ?? { ok: true }) as never);
}
