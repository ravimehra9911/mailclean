import type { NextConfig } from "next";
import desktop from "./electron/package.json";

const nextConfig: NextConfig = {
  // Self-contained server (.next/standalone) that the desktop app bundles and runs.
  output: "standalone",
  // Version shown on the About page; the desktop package.json is the source of truth.
  env: { MAILCLEAN_VERSION: desktop.version },
  // Keep the IMAP client as a plain Node dependency instead of bundling it.
  serverExternalPackages: ["imapflow"],
};

export default nextConfig;
