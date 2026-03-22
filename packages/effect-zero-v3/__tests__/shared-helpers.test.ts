import { describe, expect, test } from "vite-plus/test";
import { asErrorShape, isPushResponseLike } from "../src/server.js";
import {
  convertFieldsToDate,
  convertFieldsToEpoch,
  dateToEpoch,
  epochToDate,
} from "../src/timestamps.js";

describe("Effect v3 shared helpers", () => {
  test("converts Date-backed fields to epoch numbers", () => {
    const createdAt = new Date("2026-03-21T12:00:00.000Z");
    const updatedAt = new Date("2026-03-21T12:01:00.000Z");

    const result = convertFieldsToEpoch(
      {
        createdAt,
        id: "rec_1",
        updatedAt,
      },
      ["createdAt", "updatedAt"] as const,
    );

    expect(result).toEqual({
      createdAt: createdAt.getTime(),
      id: "rec_1",
      updatedAt: updatedAt.getTime(),
    });
  });

  test("converts epoch-backed fields to Date instances", () => {
    const createdAt = Date.parse("2026-03-21T12:00:00.000Z");

    const result = convertFieldsToDate(
      {
        createdAt,
        id: "rec_1",
      },
      ["createdAt"] as const,
    );

    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt?.toISOString()).toBe("2026-03-21T12:00:00.000Z");
  });

  test("exposes scalar epoch/date converters", () => {
    const createdAt = new Date("2026-03-21T12:00:00.000Z");

    expect(dateToEpoch(createdAt)).toBe(createdAt.getTime());
    expect(epochToDate(createdAt.getTime())?.toISOString()).toBe("2026-03-21T12:00:00.000Z");
  });

  test("recognizes Zero push responses", () => {
    expect(
      isPushResponseLike({
        mutations: [
          {
            id: {
              clientID: "client-1",
              id: 1,
            },
            result: {},
          },
        ],
      }),
    ).toBe(true);

    expect(isPushResponseLike({ ok: true })).toBe(false);
  });

  test("normalizes unknown errors into a stable shape", () => {
    const error = asErrorShape(new Error("boom"), { maxStackLines: 2 });

    expect(error.type).toBe("Error");
    expect(error.message).toBe("boom");
    expect(error.stack?.split("\n")).toHaveLength(2);
  });
});
