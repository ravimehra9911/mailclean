import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server (.next/standalone) that the desktop app bundles and runs.
  output: "standalone",
  // Keep the IMAP client as a plain Node dependency instead of bundling it.
  serverExternalPackages: ["imapflow"],
};

export default nextConfig;
