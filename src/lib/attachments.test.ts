import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadsRoot, markDownloaded, targetOf } from "./attachments";

// A fake home folder: targetOf only builds paths, nothing is written.
const HOME = path.join(os.tmpdir(), "mailclean-home");
const DATE = Date.UTC(2026, 2, 14);

beforeEach(() => {
  vi.spyOn(os, "homedir").mockReturnValue(HOME);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const target = (senderName: string, filename = "x.pdf") => targetOf({ senderName, filename, date: DATE });

describe("targetOf", () => {
  it("saves under Downloads/MailClean/<sender>/<date> <sender> - <file>", () => {
    expect(downloadsRoot()).toBe(path.join(HOME, "Downloads", "MailClean"));
    expect(target("Acme")).toBe(path.join(downloadsRoot(), "Acme", "2026-03-14 Acme - x.pdf"));
  });

  it('never leaves Downloads/MailClean for a sender named "." or ".."', () => {
    for (const name of [".", "..", "...", " .. ", "../..", "..\\..", "/"]) {
      const file = target(name);
      expect(path.dirname(path.dirname(file))).toBe(downloadsRoot());
      expect(path.basename(path.dirname(file))).not.toMatch(/^\.+$/);
    }
    expect(target("..")).toBe(path.join(downloadsRoot(), "file", "2026-03-14 file - x.pdf"));
  });

  it("keeps separators in sender and file names from adding folders", () => {
    const file = target("a/../../b", "../../evil.pdf");
    expect(path.dirname(path.dirname(file))).toBe(downloadsRoot());
    expect(path.basename(file)).toBe("2026-03-14 a .. .. b - .. .. evil.pdf");
  });

  it("renames Windows device names", () => {
    expect(path.basename(path.dirname(target("CON")))).toBe("_CON");
    expect(path.basename(path.dirname(target("nul.txt")))).toBe("_nul.txt");
    expect(path.basename(path.dirname(target("com1")))).toBe("_com1");
    expect(path.basename(path.dirname(target("Console")))).toBe("Console");
  });
});

describe("safe names", () => {
  it("drops bidi and zero-width characters that disguise the real extension", () => {
    expect(path.basename(target("Acme", "invoice\u202Efdp.exe"))).toBe("2026-03-14 Acme - invoicefdp.exe");
    expect(path.basename(path.dirname(target("Ac\u200Bme\u2066")))).toBe("Acme");
  });
});

describe.runIf(process.platform === "darwin")("markDownloaded", () => {
  it("adds the macOS quarantine flag so Gatekeeper checks the file", async () => {
    vi.restoreAllMocks();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclean-quarantine-"));
    const file = path.join(dir, "x.command");
    fs.writeFileSync(file, "echo hi");
    try {
      markDownloaded(file);
      await vi.waitFor(() => expect(execFileSync("xattr", ["-p", "com.apple.quarantine", file], { encoding: "utf8" })).toMatch(/^0081;[0-9a-f]+;MailClean;/));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
