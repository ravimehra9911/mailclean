import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the IMAP client as a plain Node dependency instead of bundling it.
  serverExternalPackages: ["imapflow"],
};

export default nextConfig;
