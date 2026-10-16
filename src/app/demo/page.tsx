import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";

export const metadata: Metadata = { title: "MailClean — live demo", description: "Try MailClean with sample data." };

// The hosted web demo (sample data; see src/lib/demo.ts).
export default function DemoPage() {
  return <Dashboard />;
}
