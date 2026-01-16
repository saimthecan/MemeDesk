import "./globals.css";
import SidebarNav from "../components/SidebarNav";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-zinc-950 text-zinc-100">
        {/* subtle background */}
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(1000px_circle_at_20%_10%,rgba(59,130,246,0.12),transparent_55%),radial-gradient(900px_circle_at_80%_20%,rgba(168,85,247,0.10),transparent_60%)]" />

        <div className="relative mx-auto max-w-7xl px-4 py-6">
          {/* top bar */}
          <header className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-sm font-semibold leading-tight">Memecoin Workspace</div>
                <div className="text-xs text-zinc-400">DEX + Alpha Calls</div>
              </div>
            </div>

          </header>

          <div className="grid grid-cols-12 gap-4">
            {/* sidebar */}
            <aside className="col-span-12 md:col-span-3 lg:col-span-2">
              <SidebarNav />
            </aside>

            {/* content */}
            <main className="col-span-12 md:col-span-9 lg:col-span-10">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4 md:p-6">
                {children}
              </div>

            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
