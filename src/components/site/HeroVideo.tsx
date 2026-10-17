"use client";

import { useEffect, useRef, useState } from "react";

/** Silent looping product demo for the hero. Plays only while visible; a still image for reduced motion. */
export function HeroVideo({ src, poster, alt }: { src: string; poster: string; alt: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setStill(true); return; }
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }, { threshold: 0.05 });
    io.observe(v);
    return () => io.disconnect();
  }, []);

  if (still) return <img src={poster} alt={alt} width={1440} height={900} className="w-full" />;
  return (
    <video ref={ref} src={src} poster={poster} muted loop playsInline preload="metadata" aria-label={alt}
      width={1920} height={1080} className="block w-full" />
  );
}
