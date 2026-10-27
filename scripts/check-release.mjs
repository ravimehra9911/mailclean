// Scans the unpacked desktop app(s) for files and strings that must never ship in a public installer:
// env files, OAuth client files, databases, encryption keys, private keys and OAuth secrets.
// Usage: node scripts/check-release.mjs [dist-desktop]   (scans every folder inside it, e.g. mac-arm64/, win-unpacked/)
// Prints the file and the rule that matched (never the matched value) and exits 1 if anything is found.
import fs from "node:fs";
import path from "node:path";

const BAD_NAMES = [
  [/^\.env/, "env file"],
  [/^client_secret/i, "OAuth client file"],
  [/\.(db|sqlite|sqlite3)(-wal|-shm|-journal)?$/i, "database"],
  [/^encryption\.key$/, "encryption key"],
  [/^\.data$/, "local data folder"],
  [/\.(pem|p12|pfx)$/i, "certificate or key file"],
];

const BAD_STRINGS = [
  [/GOCSPX-[A-Za-z0-9_-]{10,}/, "Google OAuth client secret"],
  [/GOOGLE_CLIENT_SECRET\s*["']?\s*[=:]\s*["'][A-Za-z0-9_-]{8,}/, "GOOGLE_CLIENT_SECRET value"],
  // A key body must follow the header: OpenSSL-based binaries (libvips) contain the bare header as a constant.
  [/-----BEGIN (RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]{64,}/, "private key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}/, "GitHub token"],
];

// Big binaries (the Electron framework, ICU data) can't hold our secrets; skip them to keep the scan fast.
const MAX_SCAN_BYTES = 64 * 1024 * 1024;

const findings = [];
let scanned = 0;

function checkName(name, where) {
  for (const [re, label] of BAD_NAMES) if (re.test(name)) findings.push(`${where}: ${label}`);
}

function checkContent(buf, where) {
  const text = buf.toString("latin1");
  for (const [re, label] of BAD_STRINGS) if (re.test(text)) findings.push(`${where}: contains ${label}`);
}

// File names inside an .asar archive live in its JSON header: uint32 4, uint32 size, uint32 size, uint32 length, JSON.
function asarNames(buf) {
  const len = buf.readUInt32LE(12);
  const header = JSON.parse(buf.subarray(16, 16 + len).toString("utf8"));
  const names = [];
  (function walk(node, prefix) {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      names.push([name, `${prefix}/${name}`]);
      walk(child, `${prefix}/${name}`);
    }
  })(header, "");
  return names;
}

// The packaged resources/config.json holds bundled OAuth keys for personal builds; public builds must ship `{}`.
function checkConfig(file, where) {
  let keys;
  try {
    keys = Object.keys(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    findings.push(`${where}: is not valid JSON`);
    return;
  }
  if (keys.length) findings.push(`${where}: must be {} in public builds, has ${keys.join(", ")}`);
}

function walk(dir, root) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const where = path.relative(root, full);
    checkName(entry.name, where);
    if (entry.isDirectory()) {
      walk(full, root);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name === "config.json" && /^resources$/i.test(path.basename(dir))) checkConfig(full, where);
    if (fs.statSync(full).size > MAX_SCAN_BYTES) continue;
    const buf = fs.readFileSync(full);
    scanned++;
    checkContent(buf, where);
    if (entry.name.endsWith(".asar")) {
      for (const [name, inner] of asarNames(buf)) checkName(name, `${where}:${inner}`);
    }
  }
}

const dist = path.resolve(process.argv[2] ?? "dist-desktop");
const apps = fs.readdirSync(dist, { withFileTypes: true }).filter((e) => e.isDirectory());
if (!apps.length) {
  console.error(`No unpacked app folders in ${dist} — build with electron-builder first.`);
  process.exit(1);
}
for (const app of apps) walk(path.join(dist, app.name), dist);

console.log(`Scanned ${scanned} files in ${apps.map((a) => a.name).join(", ")}.`);
if (findings.length) {
  console.error(`\nFound ${findings.length} file(s) or string(s) that must not ship:`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("No secret files or strings found.");
