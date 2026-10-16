"use client";

import { useState } from "react";

/** Selected date range in epoch ms (`to` exclusive); both undefined = all time. */
export interface DateRange {
  key: string;
  from?: number;
  to?: number;
}

export const ALL_TIME: DateRange = { key: "all" };

const DAY = 86_400_000;
const localMidnight = (iso: string) => new Date(`${iso}T00:00:00`).getTime();
const toIso = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function preset(key: string): DateRange {
  const now = Date.now();
  if (key === "30d") return { key, from: now - 30 * DAY };
  if (key === "90d") return { key, from: now - 90 * DAY };
  if (key === "365d") return { key, from: now - 365 * DAY };
  const year = key.match(/^year:(\d{4})$/)?.[1];
  if (year) return { key, from: new Date(+year, 0, 1).getTime(), to: new Date(+year + 1, 0, 1).getTime() };
  return ALL_TIME;
}

/** Adds the range to URL query parameters for the API. */
export function rangeParams(p: URLSearchParams, r: DateRange) {
  if (r.from !== undefined) p.set("from", String(Math.floor(r.from)));
  if (r.to !== undefined) p.set("to", String(Math.floor(r.to)));
}

/** Date filter: all time, recent periods, a whole year, or a custom start and end date. */
export function DateFilter({ value, years, onChange }: { value: DateRange; years: number[]; onChange: (r: DateRange) => void }) {
  const [start, setStart] = useState(value.key === "custom" && value.from ? toIso(value.from) : "");
  const [end, setEnd] = useState(value.key === "custom" && value.to ? toIso(value.to - DAY) : "");
  const custom = value.key === "custom";

  function applyCustom(s: string, e: string) {
    setStart(s);
    setEnd(e);
    if (s && e && s > e) return; // wait until the range is valid
    onChange({ key: "custom", from: s ? localMidnight(s) : undefined, to: e ? localMidnight(e) + DAY : undefined });
  }

  const input = "h-9 rounded-lg border border-line bg-card px-2 text-sm outline-none focus:border-accent";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Date range" value={value.key}
        onChange={(e) => (e.target.value === "custom" ? applyCustom(start, end) : onChange(preset(e.target.value)))}
        className={input}>
        <option value="all">All time</option>
        <option value="30d">Last 30 days</option>
        <option value="90d">Last 90 days</option>
        <option value="365d">Last 12 months</option>
        {years.length > 0 && (
          <optgroup label="Whole year">
            {years.map((y) => <option key={y} value={`year:${y}`}>{y}</option>)}
          </optgroup>
        )}
        <option value="custom">Custom dates…</option>
      </select>
      {custom && (
        <>
          <input type="date" aria-label="Start date" value={start} max={end || undefined}
            onChange={(e) => applyCustom(e.target.value, end)} className={input} />
          <span className="text-sm text-subtle">to</span>
          <input type="date" aria-label="End date" value={end} min={start || undefined}
            onChange={(e) => applyCustom(start, e.target.value)} className={input} />
        </>
      )}
    </div>
  );
}

/** Short human label for a range, e.g. "2024" or "1 Jan 2024 – 31 Mar 2024". */
export function rangeLabel(r: DateRange): string | null {
  if (r.from === undefined && r.to === undefined) return null;
  const year = r.key.match(/^year:(\d{4})$/)?.[1];
  if (year) return year;
  const fmt = (ms: number) => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  if (r.key === "30d") return "last 30 days";
  if (r.key === "90d") return "last 90 days";
  if (r.key === "365d") return "last 12 months";
  return `${r.from !== undefined ? fmt(r.from) : "start"} – ${r.to !== undefined ? fmt(r.to - DAY) : "today"}`;
}
