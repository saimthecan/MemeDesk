"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiJson } from "../../lib/api";
import type { CoinDetail, CoinSummary } from "../../lib/types";
import Link from "next/link";
import Image from "next/image";
import LoadingScreen from "../../components/LoadingScreen";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function fmtTsTR(ts: string | null): string {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");

  return `${dd}-${mm}-${yyyy} ${hh}.${mi}`;
}

function dexUrlFor(chain: string | null | undefined, ca: string): string {
  const c = (chain || "").toLowerCase();

  const map: Record<string, string> = {
    eth: "ethereum",
    ethereum: "ethereum",
    bsc: "bsc",
    sol: "solana",
    solana: "solana",
    base: "base",
    arb: "arbitrum",
    arbitrum: "arbitrum",
    polygon: "polygon",
    matic: "polygon",
    avax: "avalanche",
    avalanche: "avalanche",
    op: "optimism",
    optimism: "optimism",
    fantom: "fantom",
    ftm: "fantom",
    cronos: "cronos",
    linea: "linea",
    blast: "blast",
  };

  const slug = map[c];
  if (!slug)
    return `https://dexscreener.com/search?q=${encodeURIComponent(ca)}`;
  return `https://dexscreener.com/${slug}/${ca}`;
}

// Dexscreener chainId mapping (logo fetch için)
function dexChainIdFor(chain: string | null | undefined): string | null {
  const c = (chain || "").toLowerCase();

  const map: Record<string, string> = {
    eth: "ethereum",
    ethereum: "ethereum",
    bsc: "bsc",
    sol: "solana",
    solana: "solana",
    base: "base",
    arb: "arbitrum",
    arbitrum: "arbitrum",
    polygon: "polygon",
    matic: "polygon",
    avax: "avalanche",
    avalanche: "avalanche",
    op: "optimism",
    optimism: "optimism",
    fantom: "fantom",
    ftm: "fantom",
    cronos: "cronos",
    linea: "linea",
    blast: "blast",
  };

  return map[c] ?? null;
}

async function fetchDexLogo(
  chain: string | null | undefined,
  tokenAddress: string
): Promise<string | null> {
  const chainId = dexChainIdFor(chain);
  if (!chainId) return null;

  const url = `https://api.dexscreener.com/tokens/v1/${chainId}/${tokenAddress}`;
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) return null;

  const arr = (await res.json()) as Array<{
    baseToken?: { address?: string };
    info?: { imageUrl?: string };
  }>;

  if (!Array.isArray(arr) || arr.length === 0) return null;

  const want = tokenAddress.toLowerCase();
  const picked =
    arr.find((p) => (p?.baseToken?.address || "").toLowerCase() === want) ??
    arr[0];

  const img = picked?.info?.imageUrl;
  if (typeof img === "string" && img.trim()) return img.trim();
  return null;
}

function Modal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!props.open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div className="w-full max-w-5xl rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-lg font-semibold">{props.title}</h2>
          <button
            className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-1 text-sm text-zinc-100 hover:bg-zinc-800"
            onClick={props.onClose}
          >
            Kapat
          </button>
        </div>
        <div className="mt-3">{props.children}</div>
      </div>
    </div>
  );
}

export default function CoinsPage() {
  const [coins, setCoins] = useState<CoinSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCa, setCopiedCa] = useState<string | null>(null);
  const [initialReady, setInitialReady] = useState(false);
  const initialReadyRef = useRef(false);

  const [q, setQ] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<CoinDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // logo cache
  const [logoByCa, setLogoByCa] = useState<Record<string, string>>({});
  const inflightLogosRef = useRef<Set<string>>(new Set());

  async function refreshCoins() {
    setLoading(true);
    setError(null);
    try {
      const c = await apiJson<CoinSummary[]>("/coins/summary");
      setCoins(c);
    } catch (e: unknown) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
      if (!initialReadyRef.current) {
        initialReadyRef.current = true;
        setInitialReady(true);
      }
    }
  }

  useEffect(() => {
    refreshCoins();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return coins;
    return coins.filter((c) => {
      return (
        c.ca.toLowerCase().includes(s) ||
        c.name.toLowerCase().includes(s) ||
        (c.symbol || "").toLowerCase().includes(s)
      );
    });
  }, [coins, q]);

  // visible rows için logo çek (cache + inflight guard + limit)
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const candidates: Array<{ ca: string; chain: string }> = [];
      const seen = new Set<string>();

      for (const c of filtered) {
        const caKey = (c.ca || "").toLowerCase();
        if (!caKey) continue;

        const chain = (c.chain ?? "").trim();
        if (!chain) continue;

        if (logoByCa[caKey]) continue;
        if (inflightLogosRef.current.has(caKey)) continue;
        if (seen.has(caKey)) continue;

        seen.add(caKey);
        candidates.push({ ca: c.ca, chain });

        if (candidates.length >= 40) break;
      }

      for (const it of candidates) {
        const caKey = it.ca.toLowerCase();
        inflightLogosRef.current.add(caKey);

        try {
          const logo = await fetchDexLogo(it.chain, it.ca);
          if (!cancelled && logo) {
            setLogoByCa((m) => (m[caKey] ? m : { ...m, [caKey]: logo }));
          }
        } catch {
          // ignore
        } finally {
          inflightLogosRef.current.delete(caKey);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [filtered, logoByCa]);

  async function copyCaToClipboard(ca: string) {
    try {
      await navigator.clipboard.writeText(ca);
      setCopiedCa(ca);
      setTimeout(() => setCopiedCa(null), 1200);
    } catch {
      // fallback
      try {
        const ta = document.createElement("textarea");
        ta.value = ca;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopiedCa(ca);
        setTimeout(() => setCopiedCa(null), 1200);
      } catch (e: unknown) {
        setError(errMsg(e));
      }
    }
  }

  async function loadDetail(ca: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setError(null);
    try {
      const d = await apiJson<CoinDetail>(
        `/coins/${encodeURIComponent(ca)}/detail`
      );
      setDetail(d);
    } catch (e: unknown) {
      setError(errMsg(e));
    } finally {
      setDetailLoading(false);
    }
  }

  async function deleteCoin(ca: string) {
    if (!confirm(`Emin misiniz? Bu coin ve tüm trades/tips silinecek: ${ca}`)) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiJson(`/coins/${encodeURIComponent(ca)}`, "DELETE");
      await refreshCoins();
    } catch (e: unknown) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  const LOGO_PX = 32;

  if (!initialReady) {
    return (
      <LoadingScreen
        title="Coinler yukleniyor"
        subtitle="Liste hazirlaniyor"
      />
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tüm Coinler</h1>
          <p className="text-sm text-zinc-400">
            Tekil coin listesi + detay görüntüleme
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800/60"
            href="/"
          >
            ← Workspace
          </Link>
          <button
            className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800/60 disabled:opacity-50"
            onClick={refreshCoins}
            disabled={loading}
          >
            Yenile
          </button>
        </div>
      </header>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-900/40 bg-red-950/40 p-3 text-sm text-red-100">
          <b>Hata:</b> {error}
        </div>
      ) : null}

      <div className="mb-3 flex items-center gap-2">
        <input
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
          placeholder="Ara: CA / name / symbol"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="text-xs text-zinc-400">
          {filtered.length}/{coins.length}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/40">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-zinc-900/60 text-left text-xs text-zinc-300">
            <tr>
              <th className="border-b p-3">Coin</th>
              <th className="border-b p-3">Trades</th>
              <th className="border-b p-3">Tips</th>
              <th className="border-b p-3">Launch</th>
              <th className="border-b p-3"></th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((c) => {
              const dexUrl = dexUrlFor(c.chain, c.ca);
              const caKey = c.ca.toLowerCase();
              const logo = logoByCa[caKey];

              return (
                <tr key={c.ca} className="hover:bg-zinc-900/60">
                  <td className="border-b p-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 font-medium">
                        {logo ? (
                          <Image
                            src={logo}
                            alt=""
                            width={LOGO_PX}
                            height={LOGO_PX}
                            className="rounded-full border border-zinc-800 bg-zinc-950 shrink-0"
                            style={{ width: LOGO_PX, height: LOGO_PX }}
                            unoptimized
                            onError={() => {
                              setLogoByCa((m) => {
                                const next = { ...m };
                                delete next[caKey];
                                return next;
                              });
                            }}
                          />
                        ) : (
                          <div
                            className="rounded-full border border-zinc-800 bg-zinc-950 shrink-0"
                            style={{ width: LOGO_PX, height: LOGO_PX }}
                          />
                        )}

                        <a
                          href={dexUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-zinc-800 hover:decoration-zinc-300"
                          title="Dexscreener"
                        >
                          {c.name}
                        </a>{" "}
                        {c.symbol ? (
                          <span className="text-xs text-zinc-400">
                            ({c.symbol})
                          </span>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => copyCaToClipboard(c.ca)}
                        className="group inline-flex items-center gap-2 text-left"
                        title="Kopyalamak için tıkla"
                      >
                        <code className="cursor-pointer text-xs text-zinc-400 underline decoration-zinc-800 hover:decoration-zinc-300">
                          {c.ca}
                        </code>
                        <span
                          className={[
                            "text-xs text-emerald-400 transition-opacity",
                            copiedCa === c.ca ? "opacity-100" : "opacity-0",
                          ].join(" ")}
                          aria-hidden="true"
                        >
                          ✅
                        </span>
                      </button>
                    </div>
                  </td>

                  <td className="border-b p-3">
                    {c.trades_total}{" "}
                    {c.trades_open ? (
                      <span className="text-xs text-orange-400">
                        (open: {c.trades_open})
                      </span>
                    ) : null}
                  </td>

                  <td className="border-b p-3">{c.tips_total}</td>

                  <td className="border-b p-3 text-xs text-zinc-300">
                    {fmtTsTR(c.launch_ts)}
                  </td>

                  <td className="border-b p-3">
                    <div className="flex gap-2">
                      <button
                        className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-100 hover:bg-zinc-800/60"
                        onClick={() => loadDetail(c.ca)}
                      >
                        Detay
                      </button>
                      <button
                        className="rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2 text-xs text-red-100 hover:bg-red-900/60"
                        onClick={() => deleteCoin(c.ca)}
                      >
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 ? (
              <tr>
                <td className="p-4 text-sm text-zinc-400" colSpan={6}>
                  Sonuç yok.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal
        open={detailOpen}
        title={detail?.coin?.ca || "Detay"}
        onClose={() => {
          setDetailOpen(false);
          setDetail(null);
        }}
      >
        {detailLoading ? (
          <div className="p-2 text-sm text-gray-600">Yükleniyor...</div>
        ) : detail ? (
          <pre className="max-h-[70vh] overflow-auto rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-100">
            {JSON.stringify(detail, null, 2)}
          </pre>
        ) : (
          <div className="p-2 text-sm text-gray-600">Detay yok.</div>
        )}
      </Modal>
    </main>
  );
}
