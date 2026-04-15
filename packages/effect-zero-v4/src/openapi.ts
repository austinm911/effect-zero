import type {
  AssertMutatorDefinitions,
  EnsureMutatorDefinitions,
  MutatorDefinition,
  MutatorRegistry,
  ReadonlyJSONValue,
  Schema as ZeroSchema,
  Transaction,
} from "@rocicorp/zero";
import {
  defineMutator,
  defineMutatorWithType,
  defineMutators,
  isMutatorDefinition,
} from "@rocicorp/zero";
import type { StandardSchemaV1 } from "@standard-schema/spec";

const metadataKey = "__effectZeroOpenapi" as const;

type StandardSchemaLike = StandardSchemaV1<any, any>;

export type InferOpenapiSchemaInput<TValidator extends StandardSchemaLike> =
  TValidator extends StandardSchemaV1<infer TInput, any>
    ? Extract<TInput, ReadonlyJSONValue | undefined>
    : never;

export type InferOpenapiSchemaOutput<TValidator extends StandardSchemaLike> =
  TValidator extends StandardSchemaV1<any, infer TOutput>
    ? Extract<TOutput, ReadonlyJSONValue | undefined>
    : never;

export type OpenapiJsonSchema = Record<string, unknown>;

export interface OpenapiInfoObject {
  readonly title: string;
  readonly version: string;
  readonly description?: string;
  readonly termsOfService?: string;
  readonly contact?: Record<string, unknown>;
  readonly license?: Record<string, unknown>;
  readonly summary?: string;
}

export interface OpenapiServerObject {
  readonly url: string;
  readonly description?: string;
  readonly variables?: Record<string, unknown>;
}

export interface OpenapiMediaTypeObject {
  readonly schema?: OpenapiJsonSchema | OpenapiReferenceObject;
  readonly examples?: Record<string, unknown>;
  readonly example?: unknown;
}

export interface OpenapiReferenceObject {
  readonly $ref: string;
  readonly summary?: string;
  readonly description?: string;
}

export interface OpenapiRequestBodyObject {
  readonly description?: string;
  readonly required?: boolean;
  readonly content: Record<string, OpenapiMediaTypeObject>;
}

export interface OpenapiResponseObject {
  readonly description: string;
  readonly headers?: Record<string, unknown>;
  readonly content?: Record<string, OpenapiMediaTypeObject>;
  readonly links?: Record<string, unknown>;
}

export type OpenapiResponsesObject = Record<string, OpenapiResponseObject | OpenapiReferenceObject>;

export interface OpenapiOperationObject {
  readonly tags?: string[];
  readonly summary?: string;
  readonly description?: string;
  readonly externalDocs?: Record<string, unknown>;
  readonly operationId?: string;
  readonly parameters?: readonly unknown[];
  readonly requestBody?: OpenapiRequestBodyObject | OpenapiReferenceObject;
  readonly responses: OpenapiResponsesObject;
  readonly callbacks?: Record<string, unknown>;
  readonly deprecated?: boolean;
  readonly security?: readonly unknown[];
  readonly servers?: readonly OpenapiServerObject[];
  readonly [extension: `x-${string}`]: unknown;
}

export type OpenapiOperationDetail = Partial<OpenapiOperationObject> & {
  readonly [extension: `x-${string}`]: unknown;
};

export interface OpenapiPathItemObject {
  readonly post?: OpenapiOperationObject;
  readonly parameters?: readonly unknown[];
  readonly summary?: string;
  readonly description?: string;
}

export interface OpenapiDocument {
  readonly openapi: "3.1.0";
  readonly info: OpenapiInfoObject;
  readonly servers?: readonly OpenapiServerObject[];
  readonly paths: Record<string, OpenapiPathItemObject>;
  readonly components?: Record<string, unknown>;
  readonly security?: readonly unknown[];
  readonly tags?: readonly unknown[];
  readonly externalDocs?: Record<string, unknown>;
}

/**
 * Optional MCP-specific mutator metadata.
 *
 * By default MCP helpers reuse the OpenAPI contract:
 * `openapi.operationId` becomes the MCP tool name, `openapi.summary` becomes
 * the tool description, and `openapi.description` is the fallback description.
 * Only set `name` or `description` when the MCP tool needs wording that differs
 * from the public HTTP/OpenAPI contract and you are registering tools from
 * `createMcpToolDefinition(...)`.
 */
export interface OpenapiMutatorMcpOptions {
  /**
   * Set to `false` to exclude this mutator from generated MCP tool definitions
   * and from Elysia route-discovery MCP plugins. Set to `true` to opt this
   * mutator into route-discovery even when the route adapter is not globally
   * configured with `mcp: true`.
   *
   * Elysia route-discovery plugins still use `openapi.operationId` and
   * `openapi.summary` for tool naming and description because those plugins
   * read ordinary Elysia route metadata.
   */
  readonly enabled?: boolean;
  /**
   * MCP tool name override for `createMcpToolDefinition(...)`. Leave unset to
   * use `openapi.operationId`, then the generated `mutator_namespace_name`
   * fallback.
   */
  readonly name?: string;
  /**
   * MCP tool description override for `createMcpToolDefinition(...)`. Leave
   * unset to use `openapi.summary`, then `openapi.description`, then a
   * generated fallback sentence.
   */
  readonly description?: string;
}

export type OpenapiMutatorMcpConfig = boolean | OpenapiMutatorMcpOptions;

export interface DefineOpenapiMutatorOptions<TValidator extends StandardSchemaLike> {
  /**
   * OpenAPI operation metadata for the generated mutator route.
   *
   * MCP helpers reuse this metadata for mutator tools:
   * `operationId` -> tool name, `summary` -> tool description, and
   * `description` -> fallback tool description.
   */
  readonly openapi?: OpenapiOperationDetail;
  readonly jsonSchema?: (schema: TValidator) => OpenapiJsonSchema;
  /**
   * Optional MCP behavior for this mutator.
   *
   * `true` opts this mutator into Elysia route-discovery MCP plugins, `false`
   * excludes it from generated MCP tool definitions, and an object can override
   * the framework-neutral MCP tool name or description while still reusing the
   * OpenAPI schema.
   */
  readonly mcp?: OpenapiMutatorMcpConfig;
}

export interface DefineOpenapiMutatorInput<
  TValidator extends StandardSchemaLike,
  TContext,
  TWrappedTransaction,
  TSchema extends ZeroSchema = ZeroSchema,
> extends DefineOpenapiMutatorOptions<TValidator> {
  readonly args: TValidator;
  readonly mutate: OpenapiMutatorDefinitionFunction<
    InferOpenapiSchemaOutput<TValidator>,
    TContext,
    TWrappedTransaction,
    TSchema
  >;
}

export type OpenapiMutatorDefinitionFunction<
  TOutput extends ReadonlyJSONValue | undefined,
  TContext,
  TWrappedTransaction,
  TSchema extends ZeroSchema = ZeroSchema,
> = (input: {
  readonly args: TOutput;
  readonly ctx: TContext;
  readonly tx: Transaction<TSchema, TWrappedTransaction>;
}) => Promise<void>;

export interface OpenapiMutatorMetadata<
  TValidator extends StandardSchemaLike = StandardSchemaLike,
> {
  readonly argsSchema: TValidator;
  readonly argsSchemaVendor: string;
  readonly detail: OpenapiOperationDetail;
  readonly jsonSchema?: (schema: TValidator) => OpenapiJsonSchema;
  readonly mcp?: OpenapiMutatorMcpOptions;
}

export type OpenapiMutatorDefinition<
  TInput extends ReadonlyJSONValue | undefined = ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined = ReadonlyJSONValue | undefined,
  TContext = unknown,
  TWrappedTransaction = unknown,
  TValidator extends StandardSchemaLike = StandardSchemaLike,
> = MutatorDefinition<TInput, TOutput, TContext, TWrappedTransaction> & {
  readonly [metadataKey]: OpenapiMutatorMetadata<TValidator>;
};

export interface OpenapiMutatorEntry {
  readonly definition: OpenapiMutatorDefinition;
  readonly detail: OpenapiOperationDetail;
  readonly name: string;
  readonly path: string;
  readonly pathSegments: readonly string[];
  readonly argsSchema: StandardSchemaLike;
  readonly argsSchemaVendor: string;
  readonly mcp?: OpenapiMutatorMcpOptions;
}

export interface OpenapiMutatorRegistry<TDefinitions = unknown> {
  readonly definitions: TDefinitions;
  readonly entries: readonly OpenapiMutatorEntry[];
  readonly mutators: MutatorRegistry<EnsureMutatorDefinitions<TDefinitions>, ZeroSchema>;
}

export interface CreateOpenapiDocumentOptions {
  readonly components?: Record<string, unknown>;
  readonly externalDocs?: Record<string, unknown>;
  readonly info?: Partial<OpenapiInfoObject>;
  readonly mapJsonSchema?: Record<string, (schema: unknown) => OpenapiJsonSchema>;
  readonly pathPrefix?: string;
  readonly security?: readonly unknown[];
  readonly servers?: readonly OpenapiServerObject[];
  readonly tags?: readonly unknown[];
}

export interface CreateOpenapiOperationOptions {
  readonly includeRequestBody?: boolean;
  readonly mapJsonSchema?: Record<string, (schema: unknown) => OpenapiJsonSchema>;
}

export interface CreateMcpToolDefinitionOptions {
  /**
   * Include mutators marked with `mcp: false`. Useful for tests and custom
   * tooling; normal MCP servers should leave disabled mutators excluded.
   */
  readonly includeDisabled?: boolean;
  /**
   * JSON Schema converters keyed by Standard Schema vendor, for example
   * `{ zod: z.toJSONSchema }`.
   */
  readonly mapJsonSchema?: Record<string, (schema: unknown) => OpenapiJsonSchema>;
}

/**
 * Framework-neutral MCP tool shape for a documented Zero mutator.
 *
 * Hono and custom MCP transports can register these tool definitions with their
 * MCP SDK layer. Elysia route-discovery MCP plugins usually read the same
 * metadata from the generated Elysia route instead.
 */
export interface McpToolDefinition {
  /**
   * Human-readable tool description for the MCP server. Defaults to the
   * mutator's OpenAPI summary.
   */
  readonly description: string;
  /**
   * JSON Schema for the tool arguments, derived from the mutator args schema.
   */
  readonly inputSchema: OpenapiJsonSchema;
  /**
   * Tool name for MCP registration. Defaults to `openapi.operationId`.
   */
  readonly name: string;
}

export interface OpenapiMutatorValidationSuccess<TArgs extends ReadonlyJSONValue | undefined> {
  readonly ok: true;
  readonly args: TArgs;
}

export interface OpenapiMutatorValidationFailure {
  readonly ok: false;
  readonly issues: readonly {
    readonly message: string;
    readonly path?: readonly string[];
  }[];
}

export type OpenapiMutatorValidationResult<TArgs extends ReadonlyJSONValue | undefined> =
  | OpenapiMutatorValidationSuccess<TArgs>
  | OpenapiMutatorValidationFailure;

export function defineOpenapiMutator<
  TValidator extends StandardSchemaLike,
  TContext = unknown,
  TWrappedTransaction = unknown,
>(
  input: DefineOpenapiMutatorInput<TValidator, TContext, TWrappedTransaction>,
): OpenapiMutatorDefinition<
  InferOpenapiSchemaInput<TValidator>,
  InferOpenapiSchemaOutput<TValidator>,
  TContext,
  TWrappedTransaction,
  TValidator
> {
  const definition = defineMutator(input.args, input.mutate as never);
  return attachOpenapiMetadata(definition, input.args, input) as OpenapiMutatorDefinition<
    InferOpenapiSchemaInput<TValidator>,
    InferOpenapiSchemaOutput<TValidator>,
    TContext,
    TWrappedTransaction,
    TValidator
  >;
}

export function defineOpenapiMutatorWithType<
  TSchema extends ZeroSchema,
  TContext,
  TWrappedTransaction,
>() {
  const define = defineMutatorWithType<TSchema, TContext, TWrappedTransaction>();

  return function defineTypedOpenapiMutator<TValidator extends StandardSchemaLike>(
    input: DefineOpenapiMutatorInput<TValidator, TContext, TWrappedTransaction, TSchema>,
  ) {
    const definition = define(input.args as never, input.mutate as never);

    return attachOpenapiMetadata(
      definition,
      input.args,
      input,
    ) as unknown as OpenapiMutatorDefinition<
      InferOpenapiSchemaInput<TValidator>,
      InferOpenapiSchemaOutput<TValidator>,
      TContext,
      TWrappedTransaction,
      TValidator
    >;
  };
}

export function defineOpenapiMutators<const TDefinitions>(
  definitions: TDefinitions & AssertMutatorDefinitions<TDefinitions>,
): OpenapiMutatorRegistry<TDefinitions> {
  return {
    definitions,
    entries: collectOpenapiMutatorEntries(definitions),
    mutators: defineMutators(definitions) as MutatorRegistry<
      EnsureMutatorDefinitions<TDefinitions>,
      ZeroSchema
    >,
  };
}

export function getOpenapiMutatorEntries(
  registry: OpenapiMutatorRegistry<unknown>,
): readonly OpenapiMutatorEntry[] {
  return registry.entries;
}

export function getOpenapiMutatorMetadata(
  definition: MutatorDefinition<any, any, any, any>,
): OpenapiMutatorMetadata | undefined {
  const metadata = (definition as Partial<OpenapiMutatorDefinition>)[metadataKey];
  return metadata;
}

export function createOpenapiDocument(
  registry: OpenapiMutatorRegistry<unknown>,
  options: CreateOpenapiDocumentOptions = {},
): OpenapiDocument {
  const paths: Record<string, OpenapiPathItemObject> = {};
  const pathPrefix = normalizePathPrefix(options.pathPrefix ?? "/api/mutators");

  for (const entry of registry.entries) {
    const path = joinPath(pathPrefix, entry.path);
    paths[path] = {
      post: createOpenapiOperation(entry, options),
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      ...options.info,
      title: options.info?.title ?? "Effect Zero Mutators",
      version: options.info?.version ?? "0.0.0",
    },
    paths,
    ...(options.servers ? { servers: options.servers } : {}),
    ...(options.components ? { components: options.components } : {}),
    ...(options.security ? { security: options.security } : {}),
    ...(options.tags ? { tags: options.tags } : {}),
    ...(options.externalDocs ? { externalDocs: options.externalDocs } : {}),
  };
}

export function createOpenapiOperation(
  entry: OpenapiMutatorEntry,
  options: CreateOpenapiOperationOptions = {},
): OpenapiOperationObject {
  const metadata = getRequiredOpenapiMetadata(entry.definition);
  const { requestBody, responses, ...detail } = metadata.detail;
  const includeRequestBody = options.includeRequestBody ?? true;
  const resolvedRequestBody = includeRequestBody
    ? (requestBody ?? createJsonRequestBody(resolveJsonSchema(metadata, options.mapJsonSchema)))
    : requestBody;

  return {
    operationId: defaultOperationId(entry.name),
    tags: [entry.pathSegments[0] ?? "mutators"],
    ...detail,
    ...(resolvedRequestBody ? { requestBody: resolvedRequestBody } : {}),
    responses: responses ?? defaultResponses(),
  };
}

export function createMcpToolDefinition(
  entry: OpenapiMutatorEntry,
  options: CreateMcpToolDefinitionOptions = {},
): McpToolDefinition | undefined {
  const metadata = getRequiredOpenapiMetadata(entry.definition);
  const mcp = metadata.mcp;

  if (mcp?.enabled === false && options.includeDisabled !== true) {
    return undefined;
  }

  return {
    name: mcp?.name ?? metadata.detail.operationId ?? defaultOperationId(entry.name),
    description:
      mcp?.description ??
      metadata.detail.summary ??
      metadata.detail.description ??
      `Run the ${entry.name} mutator.`,
    inputSchema: resolveJsonSchema(metadata, options.mapJsonSchema),
  };
}

export function createMcpToolDefinitions(
  registry: OpenapiMutatorRegistry<unknown>,
  options: CreateMcpToolDefinitionOptions = {},
): readonly McpToolDefinition[] {
  return registry.entries.flatMap((entry) => {
    const definition = createMcpToolDefinition(entry, options);
    return definition ? [definition] : [];
  });
}

export async function validateOpenapiMutatorArgs(
  entry: OpenapiMutatorEntry,
  args: unknown,
): Promise<OpenapiMutatorValidationResult<ReadonlyJSONValue | undefined>> {
  const result = await entry.argsSchema["~standard"].validate(args);

  if (result.issues) {
    return {
      ok: false,
      issues: result.issues.map((issue) => ({
        message: issue.message,
        ...(issue.path ? { path: issue.path.map(formatIssuePathSegment) } : {}),
      })),
    };
  }

  return {
    ok: true,
    args: result.value as ReadonlyJSONValue | undefined,
  };
}

export function joinPath(prefix: string, path: string): string {
  const normalizedPrefix = normalizePathPrefix(prefix);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (normalizedPrefix === "") {
    return normalizedPath;
  }

  if (normalizedPath === "/") {
    return normalizedPrefix;
  }

  return `${normalizedPrefix}${normalizedPath}`;
}

function attachOpenapiMetadata<
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TContext,
  TWrappedTransaction,
  TValidator extends StandardSchemaLike,
>(
  definition: MutatorDefinition<TInput, TOutput, TContext, TWrappedTransaction>,
  validator: TValidator,
  options: DefineOpenapiMutatorOptions<TValidator>,
) {
  Object.defineProperty(definition, metadataKey, {
    configurable: false,
    enumerable: false,
    value: {
      argsSchema: validator,
      argsSchemaVendor: validator["~standard"].vendor,
      detail: options.openapi ?? {},
      ...(options.jsonSchema ? { jsonSchema: options.jsonSchema } : {}),
      ...(options.mcp !== undefined ? { mcp: normalizeMcpOptions(options.mcp) } : {}),
    } satisfies OpenapiMutatorMetadata<TValidator>,
  });

  return definition as OpenapiMutatorDefinition<
    TInput,
    TOutput,
    TContext,
    TWrappedTransaction,
    TValidator
  >;
}

function collectOpenapiMutatorEntries(
  value: unknown,
  pathSegments: readonly string[] = [],
): readonly OpenapiMutatorEntry[] {
  if (isMutatorDefinition(value)) {
    const metadata = getOpenapiMutatorMetadata(value);

    if (!metadata) {
      throw new Error(
        `Mutator '${pathSegments.join(".")}' was not created with defineOpenapiMutator(...).`,
      );
    }

    return [
      {
        argsSchema: metadata.argsSchema,
        argsSchemaVendor: metadata.argsSchemaVendor,
        definition: value as OpenapiMutatorDefinition,
        detail: metadata.detail,
        mcp: metadata.mcp,
        name: pathSegments.join("."),
        path: `/${pathSegments.map(encodeURIComponent).join("/")}`,
        pathSegments,
      },
    ];
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectOpenapiMutatorEntries(child, [...pathSegments, key]),
  );
}

function getRequiredOpenapiMetadata(definition: OpenapiMutatorDefinition) {
  const metadata = getOpenapiMutatorMetadata(definition);

  if (!metadata) {
    throw new Error("Expected an OpenAPI mutator definition.");
  }

  return metadata;
}

function resolveJsonSchema(
  metadata: OpenapiMutatorMetadata,
  mapJsonSchema?: Record<string, (schema: unknown) => OpenapiJsonSchema>,
) {
  if (metadata.jsonSchema) {
    return metadata.jsonSchema(metadata.argsSchema);
  }

  const mapper = mapJsonSchema?.[metadata.argsSchemaVendor];

  if (mapper) {
    return mapper(metadata.argsSchema);
  }

  throw new Error(
    `No JSON Schema mapper registered for '${metadata.argsSchemaVendor}'. Pass mapJsonSchema.${metadata.argsSchemaVendor} or use a schema-specific subpath such as /openapi/zod.`,
  );
}

function createJsonRequestBody(schema: OpenapiJsonSchema): OpenapiRequestBodyObject {
  return {
    required: true,
    content: {
      "application/json": {
        schema,
      },
    },
  };
}

function defaultResponses(): OpenapiResponsesObject {
  return {
    "200": {
      description: "Mutator executed successfully.",
      content: {
        "application/json": {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["ok"],
            properties: {
              ok: {
                const: true,
              },
            },
          },
        },
      },
    },
    "400": {
      description: "Invalid request body.",
    },
    "500": {
      description: "Mutator execution failed.",
    },
  };
}

function defaultOperationId(name: string) {
  return `mutator_${name.replaceAll(".", "_")}`;
}

function normalizeMcpOptions(config: OpenapiMutatorMcpConfig): OpenapiMutatorMcpOptions {
  return typeof config === "boolean" ? { enabled: config } : config;
}

function normalizePathPrefix(prefix: string) {
  if (prefix === "" || prefix === "/") {
    return "";
  }

  const withLeadingSlash = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatIssuePathSegment(segment: PropertyKey | { readonly key: PropertyKey }) {
  if (typeof segment === "object" && segment !== null && "key" in segment) {
    return String(segment.key);
  }

  return String(segment);
}
