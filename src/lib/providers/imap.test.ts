import type { MessageStructureObject } from "imapflow";
import { describe, expect, it } from "vitest";
import { attachmentsIn } from "./imap";

const part = (p: Partial<MessageStructureObject>) => ({ part: "2", type: "image/png", size: 4000, encoding: "base64", ...p }) as MessageStructureObject;
const names = (...nodes: MessageStructureObject[]) => {
  const out: Parameters<typeof attachmentsIn>[1] = [];
  attachmentsIn({ type: "multipart/mixed", childNodes: [{ part: "1", type: "text/html" } as MessageStructureObject, ...nodes] } as MessageStructureObject, out);
  return out.map((f) => f.filename);
};

describe("attachmentsIn", () => {
  it("counts attached files", () => {
    expect(names(part({ type: "application/pdf", disposition: "attachment", dispositionParameters: { filename: "statement.pdf" } }))).toEqual(["statement.pdf"]);
  });

  it("skips small inline images shown in the email (logos, signatures)", () => {
    expect(names(part({ id: "<logo@bank>", disposition: "inline", parameters: { name: "logo.png" } }))).toEqual([]);
    expect(names(part({ id: "<icon@x>", parameters: { name: "icon.gif" } }))).toEqual([]);
  });

  it("keeps large inline photos and images marked as attachments", () => {
    expect(names(part({ id: "<photo@mac>", disposition: "inline", size: 2_000_000, parameters: { name: "IMG_1234.jpg" } }))).toEqual(["IMG_1234.jpg"]);
    expect(names(part({ id: "<logo@x>", disposition: "attachment", dispositionParameters: { filename: "logo.png" } }))).toEqual(["logo.png"]);
  });
});
