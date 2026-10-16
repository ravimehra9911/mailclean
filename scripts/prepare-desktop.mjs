// Prepares .next/standalone for packaging and writes the keys the desktop app needs.
// Run after `next build` (see `npm run desktop:build`).
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("Missing .next/standalone/server.js — run `next build` first.");
  process.exit(1);
}

// The standalone server does not include static assets.
fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });

// Never ship local data or secrets inside the server folder.
for (const name of fs.readdirSync(standalone)) {
  if (name === ".data" || name.startsWith(".env") || name.startsWith("client_secret")) {
    fs.rmSync(path.join(standalone, name), { recursive: true, force: true });
    console.log(`removed ${name} from standalone output`);
  }
}

// OAuth keys: read from .env.local / .env and written to build/config.json (gitignored),
// which electron-builder copies into the app as resources/config.json.
const keys = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_TENANT", "SYNC_LIMIT"];
const config = {};
for (const file of [".env", ".env.local"]) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && keys.includes(m[1]) && m[2]) config[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
fs.mkdirSync(path.join(root, "build"), { recursive: true });
fs.writeFileSync(path.join(root, "build", "config.json"), JSON.stringify(config, null, 2));
console.log(`desktop config: ${Object.keys(config).join(", ") || "(no keys found — Gmail sign-in will be disabled)"}`);
