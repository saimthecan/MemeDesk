"use client";

type ActionOverlayProps = {
  show: boolean;
  title?: string;
  subtitle?: string;
};

export default function ActionOverlay({
  show,
  title = "İşlem yapılıyor",
  subtitle = "Lütfen bekleyin",
}: ActionOverlayProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/70">
      <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/90 px-4 py-3">
        <div className="grid h-10 w-10 place-items-center rounded-full border border-zinc-800 bg-zinc-950">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-transparent" />
        </div>
        <div>
          <div className="text-sm font-semibold text-zinc-100">{title}</div>
          <div className="text-xs text-zinc-400">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}
