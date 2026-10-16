// electron-builder afterPack hook: copies the standalone Next.js server into the app's resources.
// (extraResources would drop the server's node_modules, which it needs at runtime.)
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
};
