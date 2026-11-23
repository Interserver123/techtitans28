"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Enables scroll-reveal for any element with class "reveal". Without JS (or with
 * reduced motion) everything stays visible; nothing is ever hidden permanently.
 *
 * This lives in the shared layout, which stays mounted across client-side navigation,
 * so it must also pick up ".reveal" elements added later (a newly navigated page,
 * streamed sections). Otherwise those stay invisible until a full reload.
 */
export function RevealObserver() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const root = document.documentElement;
    root.classList.add("reveal-ready");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" },
    );
    const watch = () => document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
    watch();
    // New content (another page after client navigation, streamed sections): watch it too.
    let queued = false;
    const mo = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; watch(); });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); io.disconnect(); root.classList.remove("reveal-ready"); };
  }, []);

  // Safety net after every page change: never leave content hidden that is on or above the screen.
  useEffect(() => {
    const t = setTimeout(() => document.querySelectorAll(".reveal:not(.in)").forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("in");
    }), 1500);
    return () => clearTimeout(t);
  }, [pathname]);

  return null;
}
