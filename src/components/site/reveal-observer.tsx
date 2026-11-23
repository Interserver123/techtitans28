"use client";
import { useEffect } from "react";

/**
 * Enables scroll-reveal for any element with class "reveal". Without JS (or with
 * reduced motion) everything stays visible; nothing is ever hidden permanently.
 */
export function RevealObserver() {
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
    // Safety net: never leave content hidden if something is missed.
    const t = setTimeout(() => document.querySelectorAll(".reveal").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) el.classList.add("in");
    }), 1500);
    return () => { clearTimeout(t); io.disconnect(); root.classList.remove("reveal-ready"); };
  }, []);
  return null;
}
