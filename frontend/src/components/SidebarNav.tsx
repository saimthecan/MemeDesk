"use client";

import Link from "next/link";
import { useState } from "react";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/coins", label: "Coins" },
  { href: "/trades", label: "Trades" },
  { href: "/tips", label: "Tips" },
];

export default function SidebarNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-2">
      <div className="flex items-center justify-between px-3 py-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Menu
        </div>
        <button
          type="button"
          className="flex h-8 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-200 hover:bg-zinc-900 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Menu kapat" : "Menu ac"}
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
      </nav>
    </div>
  );
}
