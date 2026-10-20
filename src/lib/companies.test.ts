import { describe, expect, it } from "vitest";
import { companyDomain } from "./companies";

describe("companyDomain", () => {
  it("uses the registrable domain of a subdomain", () => {
    expect(companyDomain("orders@email.amazon.com")).toBe("amazon.com");
  });

  it("keeps one more label for two-part suffixes", () => {
    expect(companyDomain("news@mail.swiggy.co.in")).toBe("swiggy.co.in");
    expect(companyDomain("hello@bbc.co.uk")).toBe("bbc.co.uk");
  });

  it("lowercases the domain", () => {
    expect(companyDomain("A@News.Example.COM")).toBe("example.com");
  });

  it("returns null for personal mailbox domains", () => {
    expect(companyDomain("friend@gmail.com")).toBeNull();
    expect(companyDomain("friend@yahoo.co.in")).toBeNull();
  });

  it("returns null for addresses without a usable domain", () => {
    expect(companyDomain("unknown")).toBeNull();
    expect(companyDomain("root@localhost")).toBeNull();
  });
});
