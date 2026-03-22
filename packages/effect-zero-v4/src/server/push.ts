export interface PushResponseMutation {
  readonly id: {
    readonly id: number;
    readonly clientID: string;
  };
  readonly result: unknown;
}

export interface PushResponseLike {
  readonly mutations: readonly PushResponseMutation[];
}

export interface ErrorShape {
  readonly type: string;
  readonly message: string;
  readonly stack?: string;
}

export function isPushResponseLike(value: unknown): value is PushResponseLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "mutations" in value &&
    Array.isArray((value as { mutations?: unknown }).mutations)
  );
}

export function asErrorShape(
  error: unknown,
  options?: {
    readonly maxStackLines?: number;
  },
): ErrorShape {
  const maxStackLines = options?.maxStackLines ?? 8;
  const stack =
    error instanceof Error
      ? error.stack?.split("\n").slice(0, maxStackLines).join("\n")
      : undefined;

  return {
    type: error instanceof Error ? error.constructor.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    ...(stack ? { stack } : {}),
  };
}
