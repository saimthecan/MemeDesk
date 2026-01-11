import React from "react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-5xl rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-lg font-semibold">{title}</h2>
          <button
            className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-1 text-sm text-zinc-100 hover:bg-zinc-800"
            onClick={onClose}
          >
            Kapat
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
