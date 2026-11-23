"use client";
import { useEffect, useState } from "react";

const COLORS = ["#3B82F6", "#60A5FA", "#16A34A", "#F59E0B", "#ffffff", "#A78BFA"];

/** Lightweight confetti burst (CSS only, respects prefers-reduced-motion). */
export function WinnerCelebration() {
  const [pieces, setPieces] = useState<{ left: number; delay: number; color: string; drift: number; rot: number }[]>([]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const raf = requestAnimationFrame(() => setPieces(Array.from({ length: 70 }, () => ({
      left: Math.random() * 100, delay: Math.random() * 0.9, color: COLORS[Math.floor(Math.random() * COLORS.length)],
      drift: (Math.random() - 0.5) * 160, rot: Math.random() * 360,
    }))));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span key={i} className="confetti-piece" style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, transform: `rotate(${p.rot}deg)`, ["--drift" as string]: `${p.drift}px` }} />
      ))}
    </div>
  );
}
