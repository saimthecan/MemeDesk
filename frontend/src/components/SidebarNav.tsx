"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { errMsg } from "../utils/errors";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/coins", label: "Coins" },
  { href: "/trades", label: "Benim Trade'lerim" },
  { href: "/tips", label: "Alpha Calls" },
];

export default function SidebarNav() {
  const [open, setOpen] = useState(false);
  const [warmingUp, setWarmingUp] = useState(false);
  const [warmupMsg, setWarmupMsg] = useState<string | null>(null);
  const [warmupError, setWarmupError] = useState<string | null>(null);
  const toggleBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (toggleBtnRef.current) {
      toggleBtnRef.current.setAttribute(
        "aria-expanded",
        open ? "true" : "false"
      );
    }
  }, [open]);

  async function warmupSystem() {
    if (warmingUp) return;
    setWarmingUp(true);
    setWarmupMsg(null);
    setWarmupError(null);

    try {
      const res = await fetch("/api/warmup", {
        method: "POST",
        cache: "no-store",
      });
      const txt = await res.text();
      if (!res.ok) throw new Error(`Warmup failed (${res.status}): ${txt}`);
      setWarmupMsg("Sistem uyandı ✅");
      window.setTimeout(() => {
        setWarmupMsg(null);
      }, 3000);
    } catch (e: unknown) {
      setWarmupMsg(null);
      setWarmupError(errMsg(e));
    } finally {
      setWarmingUp(false);
    }
  }

  return (
    <div className="sticky top-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-2">
      <div className="flex items-center justify-between px-3 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Menu
        </div>
        <button
          ref={toggleBtnRef}
          type="button"
          className="flex h-8 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-200 hover:bg-zinc-900 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-controls="mobile-nav"
          aria-label={open ? "Men? kapat" : "Men? a?"}
        >
          <span className="flex flex-col items-center gap-1">
            <span className="h-0.5 w-4 rounded-full bg-zinc-200" />
            <span className="h-0.5 w-4 rounded-full bg-zinc-200" />
            <span className="h-0.5 w-4 rounded-full bg-zinc-200" />
          </span>
        </button>
      </div>

      <nav
        id="mobile-nav"
        className={`${open ? "grid" : "hidden"} gap-1 text-sm md:grid`}
      >
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-xl px-3 py-2 text-zinc-200 transition hover:bg-zinc-800/60 hover:text-white"
            onClick={() => setOpen(false)}
          >
            <div className="flex items-center justify-between">
              <span>{item.label}</span>
              <span className="text-zinc-400 opacity-0 group-hover:opacity-100">
                &gt;
              </span>
            </div>
          </Link>
        ))}
        <div className="mt-2 border-t border-zinc-800 pt-2">
          <button
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
            onClick={() => void warmupSystem()}
            disabled={warmingUp}
            type="button"
            title="Render + Neon uyandırır"
          >
            {warmingUp ? "Uyandırılıyor…" : "Sistemi uyandır"}
          </button>
          {warmupMsg ? (
            <div className="mt-2 text-xs text-emerald-300">{warmupMsg}</div>
          ) : null}
          {warmupError ? (
            <div className="mt-2 text-xs text-rose-200">{warmupError}</div>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
