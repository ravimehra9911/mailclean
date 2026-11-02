"use client";

import { useEffect, useRef, useState } from "react";

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

const QUICK: [string, string][] = [["all", "All time"], ["30d", "30 days"], ["90d", "90 days"], ["365d", "12 months"]];

/** Date filter: a button that opens quick periods, each year with email (newest first) and custom dates. */
export function DateFilter({ value, years, onChange }: { value: DateRange; years: number[]; onChange: (r: DateRange) => void }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const wrap = useRef<HTMLDivElement>(null);

  // Opening shows the current custom range (it can also be set from outside, e.g. "older than a year").
  useEffect(() => {
    if (!open) return;
    setStart(value.key === "custom" && value.from ? toIso(value.from) : "");
    setEnd(value.key === "custom" && value.to ? toIso(value.to - DAY) : "");
  }, [open, value]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown); };
  }, [open]);

  const pick = (key: string) => { onChange(preset(key)); setOpen(false); };
  const valid = (start || end) && !(start && end && start > end);
  function applyCustom() {
    if (!valid) return;
    onChange({ key: "custom", from: start ? localMidnight(start) : undefined, to: end ? localMidnight(end) + DAY : undefined });
    setOpen(false);
  }

  const label = value.key === "all" ? "All time" : value.key === "custom" ? rangeLabel(value) : (rangeLabel(value) ?? "All time").replace(/^l/, "L");
  const chip = (on: boolean) => `h-8 rounded-lg border px-3 text-sm tabular-nums ${on ? "border-accent bg-accent/10 font-semibold text-accent" : "border-line bg-card font-medium hover:bg-muted"}`;
  const heading = "text-[11px] font-semibold tracking-wider text-subtle uppercase";
  const input = "h-9 min-w-0 flex-1 rounded-lg border border-line bg-card px-2 text-sm outline-none focus:border-accent";

  return (
    <div ref={wrap} data-tour="date-filter" className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}
        className={`inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium hover:bg-muted ${value.key === "all" ? "border-line" : "border-accent"}`}>
        <svg viewBox="0 0 24 24" className="size-4 text-subtle" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <span className="whitespace-nowrap">{label}</span>
        <svg viewBox="0 0 24 24" className="size-3.5 text-subtle" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div role="dialog" aria-label="Date range"
          className="absolute top-full left-0 z-40 mt-2 flex w-[min(340px,calc(100vw-32px))] flex-col gap-2.5 rounded-xl border border-line bg-card p-4 shadow-xl sm:right-0 sm:left-auto">
          <div className={heading}>Quick</div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map(([key, text]) => (
              <button key={key} type="button" onClick={() => pick(key)} aria-pressed={value.key === key} className={chip(value.key === key)}>{text}</button>
            ))}
          </div>
          {years.length > 0 && (
            <>
              <div className="mt-1 flex items-baseline justify-between">
                <span className={heading}>Whole year</span>
                <span className="text-xs text-subtle">newest → oldest email</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[...years].sort((a, b) => b - a).map((y) => (
                  <button key={y} type="button" onClick={() => pick(`year:${y}`)} aria-pressed={value.key === `year:${y}`}
                    className={chip(value.key === `year:${y}`)}>{y}</button>
                ))}
              </div>
            </>
          )}
          <div className={`${heading} mt-1`}>Custom dates</div>
          <div className="flex items-center gap-2">
            <input type="date" aria-label="Start date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} className={input} />
            <span className="text-sm text-subtle">to</span>
            <input type="date" aria-label="End date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} className={input} />
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border border-line px-3 text-sm font-medium hover:bg-muted">Cancel</button>
            <button type="button" onClick={applyCustom} disabled={!valid}
              className="h-9 rounded-lg bg-accent px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">Apply dates</button>
          </div>
        </div>
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
