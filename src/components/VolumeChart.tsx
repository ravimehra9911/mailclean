"use client";

import { useState } from "react";
import { fmtNum } from "./api";

/** Emails received per week, as bars. Weekly buckets keep a 6-month view readable. */
export function VolumeChart({ daily }: { daily: { day: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const weeks = new Map<string, number>();
  for (const d of daily) {
    const dt = new Date(d.day + "T00:00:00Z");
    dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay()); // week starting Sunday
    const k = dt.toISOString().slice(0, 10);
    weeks.set(k, (weeks.get(k) ?? 0) + d.count);
  }
  const data = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (!data.length) return <div className="grid h-40 place-items-center text-sm text-subtle">No emails in this period</div>;

  const max = Math.max(...data.map(([, c]) => c));
  const W = 600, H = 150, gap = 3;
  const bw = W / data.length - gap;
  const label = (k: string) => new Date(k).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const shown = hover ?? data.length - 1;

  return (
    <div>
      <div className="mb-2 text-sm text-subtle">
        Week of {label(data[shown][0])}: <b className="text-ink">{fmtNum(data[shown][1])}</b> emails
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
        {data.map(([k, c], i) => {
          const h = Math.max(2, (c / max) * (H - 4));
          return (
            <rect key={k} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={2}
              className={i === shown ? "fill-accent" : "fill-accent/35"} onMouseEnter={() => setHover(i)} />
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-subtle">
        <span>{label(data[0][0])}</span>
        <span>{label(data[data.length - 1][0])}</span>
      </div>
    </div>
  );
}
