import { describe, expect, it } from "vitest";
import { decodeWords, parseFrom, parseListUnsubscribe } from "./headers";

describe("decodeWords", () => {
  it("decodes base64 encoded words", () => {
    expect(decodeWords("=?UTF-8?B?w4lsaWU=?=")).toBe("Élie");
  });

  it("decodes quoted-printable encoded words in other charsets", () => {
    expect(decodeWords("=?ISO-8859-1?Q?Caf=E9_Bar?=")).toBe("Café Bar");
  });

  it("joins adjacent encoded words without the whitespace between them", () => {
    expect(decodeWords("=?UTF-8?Q?Mail?= =?UTF-8?Q?Clean?=")).toBe("MailClean");
  });

  it("keeps plain text around encoded words", () => {
    expect(decodeWords("Team =?UTF-8?B?w4lsaWU=?= here")).toBe("Team Élie here");
  });

  it("falls back to UTF-8 for an unknown charset", () => {
    expect(decodeWords("=?x-unknown?B?aGk=?=")).toBe("hi");
  });
});

describe("parseFrom", () => {
  it("reads a quoted name and lowercases the address", () => {
    expect(parseFrom('"Doe, Jane" <Jane.Doe@Example.com>')).toEqual({ email: "jane.doe@example.com", name: "Doe, Jane" });
  });

  it("reads an unquoted name", () => {
    expect(parseFrom("Swiggy <noreply@swiggy.in>")).toEqual({ email: "noreply@swiggy.in", name: "Swiggy" });
  });

  it("decodes an encoded name", () => {
    expect(parseFrom("=?UTF-8?B?w4lsaWU=?= <elie@example.com>")).toEqual({ email: "elie@example.com", name: "Élie" });
  });

  it("returns no name for an empty one", () => {
    expect(parseFrom('"" <a@b.co>')).toEqual({ email: "a@b.co", name: null });
  });

  it("reads a bare address with a comment name", () => {
    expect(parseFrom("News@Example.com (Example News)")).toEqual({ email: "news@example.com", name: "Example News" });
  });

  it("reads a bare address", () => {
    expect(parseFrom("a@b.co")).toEqual({ email: "a@b.co", name: null });
  });

  it("handles a missing header", () => {
    expect(parseFrom(undefined)).toEqual({ email: "unknown", name: null });
    expect(parseFrom(null)).toEqual({ email: "unknown", name: null });
    expect(parseFrom("")).toEqual({ email: "unknown", name: null });
  });
});

describe("parseListUnsubscribe", () => {
  it("finds the https and mailto links and RFC 8058 one-click", () => {
    expect(parseListUnsubscribe("<mailto:unsub@x.com?subject=stop>, <https://x.com/u?id=1>", "List-Unsubscribe=One-Click"))
      .toEqual({ http: "https://x.com/u?id=1", mailto: "mailto:unsub@x.com?subject=stop", oneClick: true });
  });

  it("is not one-click without the List-Unsubscribe-Post header", () => {
    expect(parseListUnsubscribe("<https://x.com/u>", null)).toEqual({ http: "https://x.com/u", mailto: null, oneClick: false });
  });

  it("is not one-click with only a mailto link", () => {
    expect(parseListUnsubscribe("<mailto:u@x.com>", "List-Unsubscribe=One-Click"))
      .toEqual({ http: null, mailto: "mailto:u@x.com", oneClick: false });
  });

  it("ignores plain http links", () => {
    expect(parseListUnsubscribe("<http://x.com/u>", "List-Unsubscribe=One-Click")).toEqual({ http: null, mailto: null, oneClick: false });
  });

  it("handles a missing header", () => {
    expect(parseListUnsubscribe(undefined, "List-Unsubscribe=One-Click")).toEqual({ http: null, mailto: null, oneClick: false });
  });
});
