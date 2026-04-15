# TODO

- Consider a first-class traced execution wrapper for `createMutationExecutor(...)` /
  `createServerMutatorHandler(...)` so consumers can opt into `Effect.fn(...)`
  style auto-spans without hand-writing a local wrapper around `executeEffect`.
- If we add that API, keep the package logger-free and OTEL-free: expose a span-aware
  hook or helper, not an exporter or concrete logging implementation.
