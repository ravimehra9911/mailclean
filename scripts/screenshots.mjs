// Captures website screenshots from the demo (sample data only) into public/screenshots/.
// Usage: npm run desktop:prepare && npm run screenshots
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

const PORT = 3199;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclean-shots-"));
const srv = spawn(process.execPath, [server], {
  cwd: path.dirname(server),
  env: { ...process.env, PORT: String(PORT), HOSTNAME: "127.0.0.1", MAILCLEAN_DEMO: "1", DATA_DIR: dataDir, NODE_ENV: "production" },
  stdio: "ignore",
});

try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/api/accounts`)).ok) break;
    } catch { /* not up yet */ }
    if (i > 60) throw new Error("demo server did not start");
    await new Promise((r) => setTimeout(r, 250));
  }
  const out = path.join(root, "public", "screenshots");
  fs.mkdirSync(out, { recursive: true });
  const electron = path.join(root, "node_modules", ".bin", "electron");
  await new Promise((resolve, reject) => {
    const p = spawn(electron, [path.join(root, "scripts", "capture.cjs"), `http://127.0.0.1:${PORT}`, out], { stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`capture exited with ${code}`))));
  });
} finally {
  srv.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
