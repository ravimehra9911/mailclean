"use client";

// Screenshot grid for the landing page. Clicking a screenshot opens it full-size in a lightbox with
// previous/next, keyboard (← → Esc) and swipe support. Without JavaScript the links open the image itself.

import { useCallback, useEffect, useRef, useState } from "react";
import { Reveal } from "./Effects";

export interface Shot { src: string; alt: string; caption: string }

export function Gallery({ shots }: { shots: Shot[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const touchX = useRef<number | null>(null);

  const go = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + shots.length) % shots.length)), [shots.length]);
  const close = useCallback(() => {
    setOpen(null);
    opener.current?.focus();
  }, []);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [open, go, close]);

  const shot = open === null ? null : shots[open];
  const arrow = "absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-2xl text-white backdrop-blur hover:bg-white/20";

  return (
    <>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {shots.map((s, i) => (
          <Reveal key={s.src} delay={(i % 2) * 120}>
            <figure>
              <a href={s.src} aria-label={`Enlarge: ${s.caption}`}
                onClick={(e) => { e.preventDefault(); opener.current = e.currentTarget; setOpen(i); }}
                className="group block cursor-zoom-in overflow-hidden rounded-xl border border-line bg-card shadow-lg transition hover:-translate-y-1 hover:shadow-2xl">
                <img src={s.src} alt={s.alt} width={1440} height={900} loading="lazy"
                  className="w-full transition duration-500 group-hover:scale-[1.03]" />
              </a>
              <figcaption className="mt-3 text-center text-sm text-subtle">{s.caption}</figcaption>
            </figure>
          </Reveal>
        ))}
      </div>

      {shot && (
        <div role="dialog" aria-modal="true" aria-label={shot.caption}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4 backdrop-blur-sm md:p-10"
          onClick={close}
          onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
            touchX.current = null;
          }}>
          <button ref={closeRef} onClick={close} aria-label="Close"
            className="absolute top-4 right-4 z-10 grid size-10 place-items-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20">✕</button>
          {shots.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous screenshot" className={`${arrow} left-3 md:left-6`}>‹</button>
              <button onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next screenshot" className={`${arrow} right-3 md:right-6`}>›</button>
            </>
          )}
          <figure className="flex max-h-full max-w-6xl flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img key={shot.src} src={shot.src} alt={shot.alt}
              className="max-h-[80vh] w-auto rounded-lg shadow-2xl" />
            <figcaption className="mt-4 text-center text-sm text-white/85">
              {shot.caption} <span className="ml-2 text-white/50">{open! + 1} / {shots.length}</span>
            </figcaption>
          </figure>
        </div>
      )}
    </>
  );
}
