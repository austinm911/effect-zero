export type EpochMillis = number;

export type DateValueAsEpoch<T> = T extends Date
  ? EpochMillis
  : T extends Date | null
    ? EpochMillis | null
    : T extends Date | undefined
      ? EpochMillis | undefined
      : T extends Date | null | undefined
        ? EpochMillis | null | undefined
        : T;

export type EpochValueAsDate<T> = T extends EpochMillis
  ? Date
  : T extends EpochMillis | null
    ? Date | null
    : T extends EpochMillis | undefined
      ? Date | undefined
      : T extends EpochMillis | null | undefined
        ? Date | null | undefined
        : T;

export type ConvertFieldsToEpochResult<T, TKey extends keyof T> = Omit<T, TKey> & {
  [K in TKey]: DateValueAsEpoch<T[K]>;
};

export type ConvertFieldsToDateResult<T, TKey extends keyof T> = Omit<T, TKey> & {
  [K in TKey]: EpochValueAsDate<T[K]>;
};

export function epochToDate(value: EpochMillis): Date;
export function epochToDate(value: EpochMillis | null | undefined): Date | null;
export function epochToDate(value: EpochMillis | null | undefined): Date | null {
  if (value == null) return null;
  return new Date(value);
}

export function dateToEpoch<T>(value: T): DateValueAsEpoch<T> {
  if (!(value instanceof Date)) {
    return value as DateValueAsEpoch<T>;
  }

  return value.getTime() as DateValueAsEpoch<T>;
}

export function convertFieldsToDate<T extends Record<string, unknown>, TKey extends keyof T>(
  input: T,
  fields: readonly TKey[],
): ConvertFieldsToDateResult<T, TKey> {
  const result: Record<string, unknown> = { ...input };

  for (const field of fields) {
    const fieldName = field as string;
    const value = result[fieldName];

    if (value === undefined || value === null || value instanceof Date) {
      continue;
    }

    if (typeof value === "number") {
      result[fieldName] = epochToDate(value);
    }
  }

  return result as ConvertFieldsToDateResult<T, TKey>;
}

export function convertFieldsToEpoch<T extends Record<string, unknown>, TKey extends keyof T>(
  input: T,
  fields: readonly TKey[],
): ConvertFieldsToEpochResult<T, TKey> {
  const result: Record<string, unknown> = { ...input };

  for (const field of fields) {
    const fieldName = field as string;
    const value = result[fieldName];

    if (value === undefined || value === null || typeof value === "number") {
      result[fieldName] = value;
      continue;
    }

    if (value instanceof Date) {
      result[fieldName] = dateToEpoch(value);
    }
  }

  return result as ConvertFieldsToEpochResult<T, TKey>;
}
