"use client";

// Gmail's inbox tabs (Primary, Promotions, …): labels, colours and the category filter.

export type GmailCategory = "primary" | "promotions" | "social" | "updates" | "forums" | "purchases";

export const CATEGORY_INFO: Record<GmailCategory, { label: string; color: string }> = {
  primary: { label: "Primary", color: "#1a73e8" },
  promotions: { label: "Promotions", color: "#1e8e3e" },
  social: { label: "Social", color: "#d93025" },
  updates: { label: "Updates", color: "#e37400" },
  forums: { label: "Forums", color: "#8430ce" },
  purchases: { label: "Purchases", color: "#12a4af" },
};

/** Filter by Gmail tab. Only shown when some mail has a category (i.e. a Gmail account is connected). */
export function CategoryFilter({ value, options, onChange }: {
  value: GmailCategory | ""; options: { category: GmailCategory; count: number }[]; onChange: (c: GmailCategory | "") => void;
}) {
  if (!options.length && !value) return null;
  return (
    <select aria-label="Gmail category" value={value} onChange={(e) => onChange(e.target.value as GmailCategory | "")}
      title="Gmail tabs — other providers have no categories"
      className={`h-9 rounded-lg border bg-card px-2 text-sm ${value ? "border-accent" : "border-line"}`}>
      <option value="">All categories</option>
      {options.map((o) => <option key={o.category} value={o.category}>{CATEGORY_INFO[o.category].label}</option>)}
    </select>
  );
}

/** Small coloured label, e.g. "Promotions". */
export function CategoryTag({ category, share }: { category: GmailCategory; share?: number }) {
  const c = CATEGORY_INFO[category];
  return (
    <span title={share !== undefined ? `${Math.round(share * 100)}% of this sender's Gmail emails are in ${c.label}` : c.label}
      className="inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-semibold"
      style={{ color: c.color, background: `${c.color}1f` }}>
      {c.label}
    </span>
  );
}
