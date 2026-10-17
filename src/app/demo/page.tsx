import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";
import { Analytics } from "@/components/site/Analytics";

export const metadata: Metadata = {
  title: { absolute: "MailClean Live Demo — Try the Inbox Cleaner in Your Browser" },
  description:
    "Try MailClean with sample data — no download or sign-in. See top senders, filter by date, bulk-delete and unsubscribe, then download the free app for macOS, Windows or Linux.",
  alternates: { canonical: "/demo" },
  openGraph: {
    title: "MailClean Live Demo",
    description: "Try the free, private inbox cleaner in your browser with sample data.",
    url: "/demo",
    images: [{ url: "/screenshots/senders-light.png", width: 1440, height: 900, alt: "MailClean sender list" }],
  },
};

// The hosted web demo (sample data; see src/lib/demo.ts).
export default function DemoPage() {
  return (
    <>
      <Dashboard />
      <Analytics />
    </>
  );
}
