import { describe, expect, it } from "vitest";
import { isNewer } from "./updates";

describe("isNewer", () => {
  it("compares each part numerically", () => {
    expect(isNewer("1.7.10", "1.7.2")).toBe(true);
    expect(isNewer("1.10.0", "1.9.9")).toBe(true);
    expect(isNewer("2.0.0", "1.99.99")).toBe(true);
  });

  it("is false for the same or an older version", () => {
    expect(isNewer("1.7.2", "1.7.2")).toBe(false);
    expect(isNewer("1.7.1", "1.7.2")).toBe(false);
  });

  it("ignores a leading v", () => {
    expect(isNewer("v1.8.0", "1.7.2")).toBe(true);
    expect(isNewer("v1.7.2", "1.7.2")).toBe(false);
  });

  it("treats missing parts as zero", () => {
    expect(isNewer("2.0", "1.9.9")).toBe(true);
    expect(isNewer("1.7", "1.7.0")).toBe(false);
  });

  it("ignores pre-release suffixes", () => {
    expect(isNewer("1.7.2-beta.1", "1.7.2")).toBe(false);
  });
});
