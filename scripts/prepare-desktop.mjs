// Prepares .next/standalone for packaging and writes the keys the desktop app needs.
// Run after `next build` (see the `desktop:*` npm scripts).
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
// Website-only media (the hero demo video) isn't needed inside the desktop app.
fs.rmSync(path.join(standalone, "public", "media"), { recursive: true, force: true });

// Never ship local data or secrets inside the server folder.
for (const name of fs.readdirSync(standalone)) {
  if (name === ".data" || name.startsWith(".env") || name.startsWith("client_secret")) {
    fs.rmSync(path.join(standalone, name), { recursive: true, force: true });
    console.log(`removed ${name} from standalone output`);
  }
}

// OAuth keys are only bundled when MAILCLEAN_BUNDLE_OAUTH=1 (personal builds). Public builds ship without
// them: anything inside an installer can be extracted, and app-password accounts don't need them.
// Keys are read from .env.local / .env and written to build/config.json (gitignored),
// which electron-builder copies into the app as resources/config.json.
const keys = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SYNC_LIMIT"];
const config = {};
const bundleOAuth = process.env.MAILCLEAN_BUNDLE_OAUTH === "1";
for (const file of bundleOAuth ? [".env", ".env.local"] : []) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && keys.includes(m[1]) && m[2]) config[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
fs.mkdirSync(path.join(root, "build"), { recursive: true });
fs.writeFileSync(path.join(root, "build", "config.json"), JSON.stringify(config, null, 2));
console.log(bundleOAuth
  ? `desktop config: ${Object.keys(config).join(", ") || "(no keys found)"}`
  : "desktop config: public build — no OAuth keys bundled (set MAILCLEAN_BUNDLE_OAUTH=1 to include them)");
