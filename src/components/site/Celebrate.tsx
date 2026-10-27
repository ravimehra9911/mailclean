"use client";

// Confetti burst + thank-you card shown when someone downloads MailClean from the website.

import { useEffect, useRef } from "react";

// Brand palette (logo gradient).
const COLORS = ["#5546fd", "#1d3cfd", "#0157ff", "#0abbfd", "#21e2ef", "#40f7be"];

/** Fires a confetti burst from (x, y) in viewport pixels. No-op for visitors who prefer reduced motion. */
export function confetti(x: number, y: number) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "60" });
  document.body.appendChild(canvas);
  const g = canvas.getContext("2d")!;
  g.scale(dpr, dpr);

  const parts = Array.from({ length: 170 }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1; // mostly upward
    const speed = 7 + Math.random() * 11;
    return {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      round: Math.random() < 0.25,
    };
  });

  const t0 = performance.now();
  const frame = (t: number) => {
    const age = (t - t0) / 1000;
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.32; // gravity
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      g.save();
      g.globalAlpha = Math.max(0, 1 - Math.max(0, age - 2.2) / 0.8);
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      if (p.round) { g.beginPath(); g.arc(0, 0, p.w / 2, 0, Math.PI * 2); g.fill(); }
      else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 2);
      g.restore();
    }
    if (age < 3) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

const STEPS: Record<string, string[]> = {
  "mac-arm64": ["Open the downloaded .dmg and drag MailClean into Applications.", "First launch: right-click MailClean → Open → Open (the app isn't signed yet)."],
  "mac-x64": ["Open the downloaded .dmg and drag MailClean into Applications.", "First launch: right-click MailClean → Open → Open (the app isn't signed yet)."],
  windows: ["Run the downloaded MailClean-windows-x64.exe.", "If SmartScreen appears: More info → Run anyway (the app isn't signed yet)."],
  linux: ["Make it executable: chmod +x MailClean-linux-x86_64.AppImage", "Then double-click it, or run ./MailClean-linux-x86_64.AppImage"],
};

/** Thank-you card from the developer, with install steps for the chosen installer. */
export function ThankYou({ installer, onClose }: { installer: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="thanks-title" onClick={(e) => e.stopPropagation()}
        className="thanks-pop relative w-full max-w-md rounded-3xl border border-line bg-card p-7 text-center shadow-2xl">
        <button ref={closeRef} onClick={onClose} aria-label="Close" className="absolute top-3 right-3 grid size-8 place-items-center rounded-lg text-subtle hover:bg-muted hover:text-ink">✕</button>
        <div className="text-5xl">🎉</div>
        <h2 id="thanks-title" className="mt-3 text-2xl font-semibold">Thank you for downloading!</h2>
        <p className="mt-2 text-subtle">Your download has started. I hope MailClean gives you a clean, calm inbox. 💜</p>
        <ol className="mt-5 space-y-2 rounded-2xl bg-muted p-4 text-left text-sm">
          {(STEPS[installer] ?? []).map((s, i) => (
            <li key={s} className="flex gap-3"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold text-white">{i + 1}</span>{s}</li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <a href="https://github.com/ravimehra9911/mailclean" target="_blank" rel="noopener noreferrer" data-track="github" data-track-label="thank_you"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-bg hover:opacity-90">⭐ Star on GitHub</a>
          <a href="https://github.com/ravimehra9911/mailclean/issues" target="_blank" rel="noopener noreferrer" data-track="report_issue" data-track-label="thank_you"
            className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-muted">Share feedback</a>
        </div>
        <a href="https://github.com/ravimehra9911" target="_blank" rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 text-sm text-subtle hover:text-ink">
          <img src="https://github.com/ravimehra9911.png?size=64" alt="" width={28} height={28} className="rounded-full" />
          — Ravi Mehra, developer · @ravimehra9911
        </a>
      </div>
    </div>
  );
}
