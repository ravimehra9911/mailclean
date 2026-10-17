import type { NextConfig } from "next";
import desktop from "./electron/package.json";

// Google Analytics for the official website (www.mailclean.app). It is only switched on for Vercel
// builds of the upstream repository, so forks that deploy their own copy don't report into it.
// Anyone can override it with NEXT_PUBLIC_GA_ID. The desktop app never renders analytics.
const OFFICIAL_GA_ID = "G-YYKZHW20HR";
const isOfficialSite = process.env.VERCEL === "1" && process.env.VERCEL_GIT_REPO_OWNER === "ravimehra9911";
const gaId = process.env.NEXT_PUBLIC_GA_ID ?? (isOfficialSite ? OFFICIAL_GA_ID : "");

const nextConfig: NextConfig = {
  // Self-contained server (.next/standalone) that the desktop app bundles and runs.
  output: "standalone",
  env: {
    // Version shown on the About page; the desktop package.json is the source of truth.
    MAILCLEAN_VERSION: desktop.version,
    NEXT_PUBLIC_GA_ID: gaId,
  },
  // Keep the IMAP client as a plain Node dependency instead of bundling it.
  serverExternalPackages: ["imapflow"],
};

export default nextConfig;
