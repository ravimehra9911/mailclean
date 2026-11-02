// electron-builder afterPack hook: copies the standalone Next.js server into the app's resources.
// (extraResources would drop the server's node_modules, which it needs at runtime.)
// On macOS it then signs the whole app ad hoc: without a signing identity, electron-builder leaves only the
// linker's signature on the main binary, and Apple Silicon Macs report a downloaded app as "damaged".
// With a real identity, electron-builder signs after this hook and replaces the ad hoc signature.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const resources = electronPlatformName === "darwin"
    ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, "Contents", "Resources")
    : path.join(appOutDir, "resources");
  const src = path.join(packager.projectDir, ".next", "standalone");
  const dest = path.join(resources, "server");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true, verbatimSymlinks: true });
  console.log(`  • copied standalone server  to=${path.relative(packager.projectDir, dest)}`);

  if (electronPlatformName === "darwin") {
    const app = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
    execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
    console.log(`  • signed ad hoc  app=${path.relative(packager.projectDir, app)}`);
  }
};
