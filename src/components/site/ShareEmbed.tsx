"use client";

// Landing-page footer: small icon links to share MailClean (plus copy link and the system share sheet) and an "Embed"
// popup with copy-paste HTML for a "Get MailClean" badge. The badges live in public/brand/mailclean-badge(-dark).svg.

import { useEffect, useRef, useState } from "react";
import { SITE_URL } from "@/lib/site";

const SHARE_TEXT = "MailClean — a free, open-source inbox cleaner that runs on your computer. Bulk unsubscribe, clean up by sender, save attachments.";

const enc = encodeURIComponent;
const LINKS = (url: string) => [
  { id: "x", label: "X", href: `https://twitter.com/intent/tweet?text=${enc(SHARE_TEXT)}&url=${enc(url)}`, Icon: IconX },
  { id: "linkedin", label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`, Icon: IconLinkedIn },
  { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${enc(`${SHARE_TEXT} ${url}`)}`, Icon: IconChat },
  { id: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`, Icon: IconFacebook },
  { id: "reddit", label: "Reddit", href: `https://www.reddit.com/submit?url=${enc(url)}&title=${enc("MailClean — free, private inbox cleaner")}`, Icon: IconForum },
  { id: "email", label: "Email", href: `mailto:?subject=${enc("Try MailClean")}&body=${enc(`${SHARE_TEXT}\n\n${url}`)}`, Icon: IconMail },
];

const badgeCode = (theme: "light" | "dark") =>
  `<a href="${SITE_URL}/?ref=badge" target="_blank" rel="noopener">` +
  `<img src="${SITE_URL}/brand/mailclean-badge${theme === "dark" ? "-dark" : ""}.svg" alt="Get MailClean — free, private inbox cleaner" width="232" height="56"></a>`;

/** Copies text; falls back to selecting it when the clipboard is unavailable. Returns true on success. */
async function copy(text: string, fallback?: HTMLTextAreaElement | null) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    fallback?.select();
    return false;
  }
}

export function ShareEmbed() {
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [open, setOpen] = useState(false);
  const [codeBox, setCodeBox] = useState<HTMLTextAreaElement | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const code = badgeCode(theme);

  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  // Close the embed popup on Escape or a click outside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown); };
  }, [open]);

  const icon = "grid size-8 place-items-center rounded-full text-subtle transition-colors hover:bg-muted hover:text-ink";

  return (
    <div ref={wrap} className="relative flex flex-wrap items-center justify-end gap-1">
      <span className="mr-1 text-sm text-subtle">Share</span>
      {canShare && (
        <button type="button" className={icon} aria-label="Share…" title="Share…" data-track="share" data-track-label="native"
          onClick={() => navigator.share({ title: "MailClean", text: SHARE_TEXT, url: SITE_URL }).catch(() => {})}>
          <IconShare className="size-4" />
        </button>
      )}
      {LINKS(SITE_URL).map(({ id, label, href, Icon }) => (
        <a key={id} href={href} target="_blank" rel="noopener noreferrer" className={icon} data-track="share" data-track-label={id}
          aria-label={`Share on ${label}`} title={label}>
          <Icon className="size-4" />
        </a>
      ))}
      <button type="button" className={icon} data-track="share" data-track-label="copy"
        aria-label={copied === "link" ? "Link copied" : "Copy link"} title={copied === "link" ? "Link copied" : "Copy link"}
        onClick={async () => { if (await copy(SITE_URL)) setCopied("link"); }}>
        {copied === "link" ? <IconCheck className="size-4 text-accent" /> : <IconLink className="size-4" />}
      </button>
      <span aria-hidden className="mx-1 hidden h-4 w-px bg-line sm:block" />
      <button type="button" aria-expanded={open} aria-controls="embed-pop" onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm text-subtle transition-colors hover:bg-muted hover:text-ink">
        <IconCode className="size-4" /> Embed
      </button>

      {open && (
        <div id="embed-pop" role="dialog" aria-label="Embed a MailClean badge"
          className="absolute right-0 bottom-full z-30 mb-2 w-[min(360px,calc(100vw-32px))] rounded-xl border border-line bg-card p-4 text-sm shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-ink">Add a badge to your site</span>
            <div role="group" aria-label="Badge style" className="flex rounded-md bg-muted p-0.5 text-xs">
              {(["light", "dark"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTheme(t)} aria-pressed={theme === t}
                  className={`rounded px-2 py-0.5 font-medium capitalize ${theme === t ? "bg-card text-ink shadow-sm" : "text-subtle"}`}>{t}</button>
              ))}
            </div>
          </div>
          <img src={`/brand/mailclean-badge${theme === "dark" ? "-dark" : ""}.svg`} alt="Get MailClean — free, private inbox cleaner"
            width={232} height={56} className="mt-3" />
          <label htmlFor="embed-code" className="sr-only">Embed code</label>
          <textarea id="embed-code" ref={setCodeBox} readOnly value={code} rows={4} onFocus={(e) => e.currentTarget.select()}
            className="mt-3 w-full resize-none rounded-lg border border-line bg-muted p-2.5 font-mono text-[11px] leading-relaxed text-ink" />
          <button type="button" data-track="embed" data-track-label={theme}
            onClick={async () => { if (await copy(code, codeBox)) setCopied("code"); }}
            className="mt-2 w-full rounded-lg bg-accent py-2 text-sm font-semibold text-white hover:opacity-90">
            {copied === "code" ? "Copied" : "Copy code"}
          </button>
        </div>
      )}
    </div>
  );
}

type P = { className?: string };
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true };

function IconX({ className }: P) {
  return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" /></svg>;
}
function IconLinkedIn({ className }: P) {
  return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>;
}
function IconFacebook({ className }: P) {
  return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" /></svg>;
}
function IconChat({ className }: P) {
  return <svg {...stroke} className={className}><path d="M3.5 20.5 5 16a8 8 0 1 1 3 3Z" /></svg>;
}
function IconForum({ className }: P) {
  return <svg {...stroke} className={className}><path d="M21 12a8 8 0 0 1-12 7l-5 1 1-4.5A8 8 0 1 1 21 12Z" /><path d="M8.5 13.5c1.8 1.6 5.2 1.6 7 0" /><circle cx="9" cy="10" r=".6" /><circle cx="15" cy="10" r=".6" /></svg>;
}
function IconMail({ className }: P) {
  return <svg {...stroke} className={className}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
}
function IconLink({ className }: P) {
  return <svg {...stroke} className={className}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>;
}
function IconShare({ className }: P) {
  return <svg {...stroke} className={className}><path d="M12 3v13" /><path d="m7 8 5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>;
}
function IconCheck({ className }: P) {
  return <svg {...stroke} className={className}><path d="m5 12 5 5L20 7" /></svg>;
}
function IconCode({ className }: P) {
  return <svg {...stroke} className={className}><path d="m8 7-5 5 5 5" /><path d="m16 7 5 5-5 5" /></svg>;
}
