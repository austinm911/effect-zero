import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { describe, expect, test } from "vite-plus/test";
import { z } from "zod";
import {
  createMcpToolDefinitions,
  createOpenapiDocument,
  defineOpenapiMutators,
  getOpenapiMutatorEntries,
} from "../src/openapi.js";
import { zeroMutatorRoutes as elysiaZeroMutatorRoutes } from "../src/openapi/elysia.js";
import { zeroMutatorRoutes as honoZeroMutatorRoutes } from "../src/openapi/hono.js";
import { defineOpenapiMutator } from "../src/openapi/zod.js";

describe("Effect v4 OpenAPI mutator helpers", () => {
  test("builds an OpenAPI 3.1 document from Zod-backed mutator contracts", () => {
    const registry = createCartRegistry();
    const entries = getOpenapiMutatorEntries(registry);
    const document = createOpenapiDocument(registry, {
      info: {
        title: "ZTunes Mutator API",
        version: "1.0.0",
      },
      pathPrefix: "/api/mutators",
    });

    expect(entries.map((entry) => entry.name)).toEqual(["cart.add", "cart.remove"]);
    expect(document.openapi).toBe("3.1.0");
    expect(document.info).toEqual({
      title: "ZTunes Mutator API",
      version: "1.0.0",
    });
    expect(
      createOpenapiDocument(registry, {
        info: {
          title: undefined as unknown as string,
          version: undefined as unknown as string,
        },
      }).info,
    ).toEqual({
      title: "Effect Zero Mutators",
      version: "0.0.0",
    });

    const addOperation = document.paths["/api/mutators/cart/add"]?.post;
    expect(addOperation?.operationId).toBe("cart_add");
    expect(addOperation?.summary).toBe("Add an album to the cart");
    expect(addOperation?.description).toBe("Adds or updates the current user's cart item.");
    expect(addOperation?.tags).toEqual(["Cart"]);
    expect(addOperation?.requestBody).toMatchObject({
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["albumId", "addedAt"],
            properties: {
              albumId: {
                type: "string",
              },
              addedAt: {
                type: "number",
              },
            },
          },
        },
      },
    });
    expect(addOperation?.responses["200"]).toMatchObject({
      description: "Mutator executed successfully.",
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["ok"],
            properties: {
              ok: {
                const: true,
              },
            },
          },
        },
      },
    });

    expect(createMcpToolDefinitions(registry)).toMatchObject([
      {
        name: "cart_add",
        description: "Add an album to the cart",
        inputSchema: {
          type: "object",
          required: ["albumId", "addedAt"],
          properties: {
            albumId: {
              type: "string",
            },
            addedAt: {
              type: "number",
            },
          },
        },
      },
    ]);
  });

  test("registers executable Hono routes and validates request bodies", async () => {
    const registry = createCartRegistry();
    const calls: unknown[] = [];
    const app = honoZeroMutatorRoutes({
      registry,
      run: (input) => {
        calls.push({
          args: input.args,
          name: input.name,
        });

        return {
          ok: true,
          name: input.name,
        };
      },
    });

    const response = await app.request("http://localhost/cart/add", {
      body: JSON.stringify({
        addedAt: 123,
        albumId: "album-1",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      name: "cart.add",
    });
    expect(calls).toEqual([
      {
        args: {
          addedAt: 123,
          albumId: "album-1",
        },
        name: "cart.add",
      },
    ]);

    const invalidResponse = await app.request("http://localhost/cart/add", {
      body: JSON.stringify({
        albumId: "album-1",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    const invalidBody = await invalidResponse.json();

    expect(invalidResponse.status).toBe(400);
    expect(invalidBody).toMatchObject({
      error: "Invalid request body.",
      issues: [
        {
          path: ["addedAt"],
        },
      ],
    });
  });

  test("builds MCP tool definitions with opt-out and wording overrides", () => {
    const registry = defineOpenapiMutators({
      agentNamed: defineOpenapiMutator({
        args: z.object({
          albumId: z.string().describe("Album ID to add to the cart."),
        }),
        mutate: async () => {},
        openapi: {
          operationId: "cart_add_http",
          summary: "Add an album over HTTP",
        },
        mcp: {
          name: "add_album_to_cart",
          description: "Add one album to the current user's cart.",
        },
      }),
      defaultNamed: defineOpenapiMutator({
        args: z.object({
          albumId: z.string(),
        }),
        mutate: async () => {},
        openapi: {
          operationId: "cart_remove",
          summary: "Remove an album from the cart",
        },
      }),
      disabled: defineOpenapiMutator({
        args: z.object({
          albumId: z.string(),
        }),
        mutate: async () => {},
        openapi: {
          operationId: "cart_internal_reprice",
          summary: "Reprice a cart item",
        },
        mcp: false,
      }),
    });

    expect(
      createMcpToolDefinitions(registry).map(({ description, name }) => ({ description, name })),
    ).toEqual([
      {
        name: "add_album_to_cart",
        description: "Add one album to the current user's cart.",
      },
      {
        name: "cart_remove",
        description: "Remove an album from the cart",
      },
    ]);
    expect(
      createMcpToolDefinitions(registry, { includeDisabled: true }).map(
        ({ description, name }) => ({ description, name }),
      ),
    ).toEqual([
      {
        name: "add_album_to_cart",
        description: "Add one album to the current user's cart.",
      },
      {
        name: "cart_remove",
        description: "Remove an album from the cart",
      },
      {
        name: "cart_internal_reprice",
        description: "Reprice a cart item",
      },
    ]);
  });

  test("registers Elysia routes that feed @elysiajs/openapi", async () => {
    const registry = createCartRegistry();
    const calls: unknown[] = [];
    const app = new Elysia()
      .use(
        openapi({
          mapJsonSchema: {
            zod: z.toJSONSchema,
          },
          provider: null,
        }),
      )
      .use(
        elysiaZeroMutatorRoutes({
          mcp: true,
          prefix: "/api/mutators",
          registry,
          run: (input) => {
            calls.push({
              args: input.args,
              name: input.name,
            });

            return {
              ok: true,
            };
          },
        }),
      );

    const response = await app.handle(
      new Request("http://localhost/api/mutators/cart/add", {
        body: JSON.stringify({
          addedAt: 123,
          albumId: "album-1",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(calls).toEqual([
      {
        args: {
          addedAt: 123,
          albumId: "album-1",
        },
        name: "cart.add",
      },
    ]);

    const documentResponse = await app.handle(new Request("http://localhost/openapi/json"));
    const document = await documentResponse.json();

    expect(documentResponse.status).toBe(200);
    expect(document.paths["/api/mutators/cart/add"].post).toMatchObject({
      summary: "Add an album to the cart",
      description: "Adds or updates the current user's cart item.",
      tags: ["Cart"],
      responses: {
        "200": {
          description: "Mutator executed successfully.",
        },
      },
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["albumId", "addedAt"],
            },
          },
        },
      },
    });

    const addRoute = app.routes.find((route) => route.path === "/api/mutators/cart/add");
    const removeRoute = app.routes.find((route) => route.path === "/api/mutators/cart/remove");

    expect((addRoute?.hooks.detail as Record<string, unknown> | undefined)?.mcp).toBe(true);
    expect((removeRoute?.hooks.detail as Record<string, unknown> | undefined)?.mcp).toBe(false);
  });
});

function createCartRegistry() {
  const addCartItemArgs = z.object({
    albumId: z.string(),
    addedAt: z.number(),
  });
  const removeCartItemArgs = z.object({
    albumId: z.string(),
  });

  const add = defineOpenapiMutator({
    args: addCartItemArgs,
    mutate: async () => {},
    openapi: {
      operationId: "cart_add",
      summary: "Add an album to the cart",
      description: "Adds or updates the current user's cart item.",
      tags: ["Cart"],
    },
    mcp: true,
  });
  const remove = defineOpenapiMutator({
    args: removeCartItemArgs,
    mutate: async () => {},
    openapi: {
      summary: "Remove an album from the cart",
      tags: ["Cart"],
    },
    mcp: false,
  });

  return defineOpenapiMutators({
    cart: {
      add,
      remove,
    },
  });
}
