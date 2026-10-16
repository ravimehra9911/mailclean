// Records the demo walkthrough video into marketing/MailClean-demo.mp4 using sample data only.
// Usage: npm run desktop:prepare && node scripts/marketing/record.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const server = path.join(root, ".next", "standalone", "server.js");
if (!fs.existsSync(server)) {
  console.error("Run `npm run desktop:prepare` first (builds .next/standalone).");
  process.exit(1);
}
const PORT = 3198;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclean-rec-"));
const srv = spawn(process.execPath, [server], {
  cwd: path.dirname(server),
  env: { ...process.env, PORT: String(PORT), HOSTNAME: "127.0.0.1", MAILCLEAN_DEMO: "1", DATA_DIR: dataDir, NODE_ENV: "production" },
  stdio: "ignore",
});
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/accounts`)).ok) break; } catch { /* starting */ }
    if (i > 60) throw new Error("demo server did not start");
    await new Promise((r) => setTimeout(r, 250));
  }
  const out = path.join(root, "marketing");
  fs.mkdirSync(out, { recursive: true });
  await new Promise((resolve, reject) => {
    const p = spawn(path.join(root, "node_modules", ".bin", "electron"),
      [path.join(root, "scripts", "marketing", "record-demo.cjs"), `http://127.0.0.1:${PORT}`, path.join(out, "MailClean-demo.mp4")],
      { stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`recorder exited with ${code}`))));
  });
  // Chromium writes fragmented MP4 (no overall duration); remux to a standard MP4 with macOS's avconvert when present.
  const mp4 = path.join(out, "MailClean-demo.mp4");
  if (process.platform === "darwin" && fs.existsSync(mp4)) {
    const raw = path.join(out, ".raw-demo.mp4");
    fs.renameSync(mp4, raw);
    await new Promise((resolve, reject) => {
      const p = spawn("avconvert", ["--source", raw, "--preset", "PresetHighestQuality", "--output", mp4, "--replace"], { stdio: "ignore" });
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`avconvert exited with ${code}`))));
    });
    fs.rmSync(raw);
    console.log("converted to standard MP4:", path.relative(root, mp4));
  }
} finally {
  srv.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
