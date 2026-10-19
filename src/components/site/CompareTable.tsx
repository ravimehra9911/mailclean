import { COMPETITORS, MAILCLEAN, ROWS, type Fact } from "@/lib/competitors";

// Comparison chart: MailClean against other inbox cleaners. `compact` shows only the yes/no rows.

function Cell({ v, compact }: { v: Fact; compact?: boolean }) {
  if (v === true) return <span className="font-semibold text-ok" aria-label="Yes">✓</span>;
  if (v === false) return <span className="text-subtle/60" aria-label="No">✕</span>;
  // In compact mode a sentence becomes a mark, with the detail in a tooltip.
  if (compact && /^No\b/.test(v)) return <span title={v} className="cursor-help text-subtle/60" aria-label={v}>✕</span>;
  if (compact && /Not stated|unclear/i.test(v)) return <span title={v} className="cursor-help text-subtle" aria-label={v}>?</span>;
  if (compact) return <span title={v} className="cursor-help text-[#b7791f]" aria-label={v}>◐</span>;
  return <span className={/^No\b|Not stated|unclear/i.test(v) ? "text-subtle" : ""}>{v}</span>;
}

export function CompareTable({ compact = false }: { compact?: boolean }) {
  const rows = compact ? ROWS.filter((r) => r.key) : ROWS;
  const tools = [MAILCLEAN, ...COMPETITORS];
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-card">
      <table className={`w-full text-sm ${compact ? "min-w-[760px]" : "min-w-[1120px]"}`}>
        <thead className="border-b border-line">
          <tr>
            <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-medium text-subtle"></th>
            {tools.map((t) => (
              <th key={t.id} scope="col"
                className={`px-3 py-3 font-semibold ${compact ? "text-center" : "text-left"} ${t === MAILCLEAN ? "bg-accent/10 text-accent" : ""}`}>
                {t.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line align-top last:border-0">
              <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-medium whitespace-nowrap">{r.label}</th>
              {tools.map((t) => (
                <td key={t.id} className={`px-3 py-3 ${compact ? "text-center text-base" : "text-[13px] leading-snug"} ${t === MAILCLEAN ? "bg-accent/10" : ""}`}>
                  <Cell v={t.facts[r.id]} compact={compact} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {compact && (
        <p className="border-t border-line px-4 py-2.5 text-xs text-subtle">
          <span className="text-ok">✓</span> yes · <span className="text-[#b7791f]">◐</span> partly (hover for details) · ✕ no · ? not stated
        </p>
      )}
    </div>
  );
}
