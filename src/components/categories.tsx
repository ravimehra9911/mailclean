"use client";

// Gmail's inbox tabs (Primary, Promotions, …): labels and colours.

export type GmailCategory = "primary" | "promotions" | "social" | "updates" | "forums" | "purchases";

export const CATEGORY_INFO: Record<GmailCategory, { label: string; color: string }> = {
  primary: { label: "Primary", color: "#1a73e8" },
  promotions: { label: "Promotions", color: "#1e8e3e" },
  social: { label: "Social", color: "#d93025" },
  updates: { label: "Updates", color: "#e37400" },
  forums: { label: "Forums", color: "#8430ce" },
  purchases: { label: "Purchases", color: "#12a4af" },
};
