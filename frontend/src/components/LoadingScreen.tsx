"use client";

type LoadingScreenProps = {
  title?: string;
  subtitle?: string;
};

export default function LoadingScreen({
  title = "Yukleniyor",
  subtitle = "Veriler hazirlaniyor",
}: LoadingScreenProps) {
  return (
    <div className="relative min-h-[320px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute -left-20 -bottom-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative flex flex-wrap items-center gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-full border border-zinc-800 bg-zinc-950">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-transparent" />
        </div>
        <div>
          <div className="text-sm font-semibold text-zinc-100">{title}</div>
          <div className="text-xs text-zinc-400">{subtitle}</div>
        </div>
      </div>

      <div className="relative mt-5 h-2 w-full overflow-hidden rounded-full bg-zinc-900">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-linear-to-r from-sky-400/20 via-emerald-400/20 to-transparent" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="h-12 rounded-xl border border-zinc-800 bg-zinc-950/40 animate-pulse" />
        <div className="h-12 rounded-xl border border-zinc-800 bg-zinc-950/40 animate-pulse" />
        <div className="h-12 rounded-xl border border-zinc-800 bg-zinc-950/40 animate-pulse" />
      </div>
    </div>
  );
}
