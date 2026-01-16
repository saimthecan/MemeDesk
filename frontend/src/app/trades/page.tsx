"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiGet, apiJson } from "@/lib/api";
import Image from "next/image";
import LoadingScreen from "@/components/LoadingScreen";
import ActionOverlay from "@/components/ActionOverlay";

type TradeRow = {
  id: number;
  trade_id: string;
  ca: string;
  coin_name: string;
  coin_symbol?: string | null;

  chain?: string | null;
  entry_ts: string | null;
  entry_mcap_usd: number | null;
  size_usd: number | null;

  exit_ts: string | null;
  exit_mcap_usd: number | null;
  exit_reason: string | null;

  pnl_pct: number | null;
  pnl_usd: number | null;
};

type CoinSummaryRow = {
  ca: string;
  symbol?: string | null;
  chain?: string | null;
};

type TradesPageResponse = {
  items: TradeRow[];
  total_count: number;
  open_count: number;
  closed_count: number;
  next_cursor: string | null;
};

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// Full USD (tooltip / detay)
const nfUsd0 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function fmtUsdFull(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return nfUsd0.format(n);
}

const nfTr0 = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 0,
});

function fmtUsdTR(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return `$ ${nfTr0.format(n)}`;
}

function fmtDigitsTR(value: string): string {
  if (!value) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return nfTr0.format(n);
}

function fmtPctSigned(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function fmtDtTR(s: string | null | undefined): string {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
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
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  if (!props.open) return null;

  const sizeClass =
    props.size === "sm"
      ? "max-w-md"
      : props.size === "lg"
      ? "max-w-4xl"
      : "max-w-2xl";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        className={`w-full ${sizeClass} rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="text-base font-semibold text-zinc-100">
            {props.title}
          </div>
          <button
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-800"
            onClick={props.onClose}
            type="button"
          >
            Kapat
          </button>
        </div>
        <div className="p-5">{props.children}</div>
      </div>
    </div>
  );
}


export default function TradesPage() {
  const PAGE_SIZE = 30;
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [symbolsByCa, setSymbolsByCa] = useState<Record<string, string>>({});
  const [chainsByCa, setChainsByCa] = useState<Record<string, string>>({});

  // logo cache
  const [logoByCa, setLogoByCa] = useState<Record<string, string>>({});
  const inflightLogosRef = useRef<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [closedCount, setClosedCount] = useState<number | null>(null);
  const [initialReady, setInitialReady] = useState(false);
  const initialReadyRef = useRef(false);

  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [scope, setScope] = useState<"all" | "open" | "closed">("all");

  // close modal
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeTradeId, setCloseTradeId] = useState<string>("");
  const [exitMcap, setExitMcap] = useState<string>("");
  const [exitReason, setExitReason] = useState<string>("");

  // edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editTradeId, setEditTradeId] = useState<string>("");
  const [editExitMcap, setEditExitMcap] = useState<string>("");
  const [editExitReason, setEditExitReason] = useState<string>("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTradeId, setDeleteTradeId] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setErr(null);
    setNextCursor(null);

    try {
      const qParam = qDebounced.trim() ? `&q=${encodeURIComponent(qDebounced.trim())}` : "";
      const [tradesRes, summaryRes] = await Promise.allSettled([
        apiGet<TradesPageResponse>(
          `/trades/paged?limit=${PAGE_SIZE}&scope=${encodeURIComponent(scope)}${qParam}`
        ),
        apiGet<CoinSummaryRow[]>("/coins/summary"),
      ]);

      if (tradesRes.status === "fulfilled") {
        setTrades(tradesRes.value.items);
        setNextCursor(tradesRes.value.next_cursor || null);
        setTotalCount(tradesRes.value.total_count);
        setOpenCount(tradesRes.value.open_count);
        setClosedCount(tradesRes.value.closed_count);
      } else {
        throw tradesRes.reason;
      }

      if (summaryRes.status === "fulfilled") {
        const symMap: Record<string, string> = {};
        const chainMap: Record<string, string> = {};

        for (const c of summaryRes.value) {
          const ca = (c.ca || "").toLowerCase();
          const sym = (c.symbol || "").trim();
          const ch = (c.chain || "").trim();

          if (ca) {
            if (sym) symMap[ca] = sym;
            if (ch) chainMap[ca] = ch;
          }
        }

        setSymbolsByCa(symMap);
        setChainsByCa(chainMap);
      }
    } catch (e: unknown) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
      if (!initialReadyRef.current) {
        initialReadyRef.current = true;
        setInitialReady(true);
      }
    }
  }, [PAGE_SIZE, qDebounced, scope]);

  async function loadMore(): Promise<void> {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setErr(null);
    try {
      const qParam = qDebounced.trim() ? `&q=${encodeURIComponent(qDebounced.trim())}` : "";
      const res = await apiGet<TradesPageResponse>(
        `/trades/paged?limit=${PAGE_SIZE}&scope=${encodeURIComponent(scope)}&cursor=${encodeURIComponent(nextCursor)}${qParam}`
      );
      setTrades((prev) => [...prev, ...res.items]);
      setNextCursor(res.next_cursor || null);
      setTotalCount(res.total_count);
      setOpenCount(res.open_count);
      setClosedCount(res.closed_count);
    } catch (e: unknown) {
      setErr(errMsg(e));
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const filtered = useMemo(() => {
    const needle = qDebounced.trim().toLowerCase();
    return trades.filter((t) => {
      const isOpen = t.exit_ts == null;
      if (scope === "open" && !isOpen) return false;
      if (scope === "closed" && isOpen) return false;
      if (!needle) return true;

      const sym = (
        t.coin_symbol ??
        symbolsByCa[t.ca.toLowerCase()] ??
        ""
      ).trim();
      const hay = `${t.coin_name} ${sym} ${t.ca} ${t.trade_id}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [trades, qDebounced, scope, symbolsByCa]);

  // visible rows için logo çek (cache + inflight guard + limit)
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const candidates: Array<{ ca: string; chain: string }> = [];
      const seen = new Set<string>();

      for (const t of filtered) {
        const caKey = (t.ca || "").toLowerCase();
        if (!caKey) continue;

        const chain = (t.chain ?? chainsByCa[caKey] ?? "").trim();
        if (!chain) continue;

        if (logoByCa[caKey]) continue;
        if (inflightLogosRef.current.has(caKey)) continue;
        if (seen.has(caKey)) continue;

        seen.add(caKey);
        candidates.push({ ca: t.ca, chain });

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
  }, [filtered, chainsByCa, logoByCa]);

  const openCountLocal = useMemo(
    () => trades.filter((t) => t.exit_ts == null).length,
    [trades]
  );
  const closedCountLocal = useMemo(
    () => trades.filter((t) => t.exit_ts != null).length,
    [trades]
  );
  const displayTotal = totalCount ?? trades.length;
  const displayOpen = openCount ?? openCountLocal;
  const displayClosed = closedCount ?? closedCountLocal;

  function openCloseModal(trade: TradeRow) {
    setCloseTradeId(trade.trade_id);
    setExitMcap(
      trade.entry_mcap_usd != null
        ? String(Math.round(trade.entry_mcap_usd))
        : ""
    );
    setExitReason("");
    setCloseOpen(true);
  }

  function openEditModal(trade: TradeRow) {
    setEditTradeId(trade.trade_id);
    setEditExitMcap(trade.exit_mcap_usd ? String(trade.exit_mcap_usd) : "");
    setEditExitReason(trade.exit_reason ?? "");
    setEditOpen(true);
  }

  async function submitClose(): Promise<void> {
    if (!closeTradeId) return;

    const ex = Number(exitMcap);
    if (!Number.isFinite(ex) || ex <= 0) {
      setErr("Exit MCAP zorunlu (pozitif sayı).");
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      await apiJson(`/trades/${encodeURIComponent(closeTradeId)}/close`, "POST", {
        exit_mcap_usd: ex,
        exit_reason: exitReason.trim() ? exitReason.trim() : null,
      });

      setCloseOpen(false);
      setCloseTradeId("");
      setExitMcap("");
      setExitReason("");
      await refresh();
    } catch (e: unknown) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  async function submitEdit(): Promise<void> {
    if (!editTradeId) return;

    const ex = Number(editExitMcap);
    if (!Number.isFinite(ex) || ex <= 0) {
      setErr("Exit MCAP zorunlu (pozitif sayi).");
      return;
    }

    setLoading(true);
    setErr(null);
    try {
      await apiJson(`/trades/${encodeURIComponent(editTradeId)}`, "PATCH", {
        exit_mcap_usd: ex,
        exit_reason: editExitReason.trim() ? editExitReason.trim() : null,
      });
      setEditOpen(false);
      setEditTradeId("");
      setEditExitMcap("");
      setEditExitReason("");
      await refresh();
    } catch (e: unknown) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  function requestDeleteTrade(tradeId: string): void {
    setDeleteTradeId(tradeId);
    setDeleteOpen(true);
  }

  async function confirmDeleteTrade(): Promise<void> {
    if (!deleteTradeId) return;
    setLoading(true);
    setErr(null);

    try {
      await apiJson(`/trades/${encodeURIComponent(deleteTradeId)}`, "DELETE");
      await refresh();
      setDeleteOpen(false);
      setDeleteTradeId(null);
    } catch (e: unknown) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }



  const LOGO_PX = 32;

  if (!initialReady) {
    return (
      <LoadingScreen
        title="Trade'lerim yükleniyor"
        subtitle="Kayıtlar hazırlanıyor"
      />
    );
  }

  return (
    <main className="relative grid gap-4">
      <ActionOverlay
        show={loading}
        title="İşlem yapılıyor"
        subtitle="Trade listesi güncelleniyor"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Benim Trade&apos;lerim</h1>
          <p className="text-sm text-zinc-400">
            Burada sadece <span className="text-zinc-200">trade</span> kayıtları
            var (açık + kapalı).
          </p>
        </div>

        <button
          className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-60"
          onClick={() => void refresh()}
          disabled={loading}
          type="button"
        >
          {loading ? "Yükleniyor…" : "Yenile"}
        </button>
      </div>

      {err ? (
        <div className="rounded-2xl border border-rose-900/70 bg-rose-950/40 p-4 text-sm text-rose-100">
          <div className="font-semibold">Hata</div>
          <div className="mt-1 whitespace-pre-wrap text-rose-200">{err}</div>
        </div>
      ) : null}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
              Toplam: <span className="font-semibold">{displayTotal}</span>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
              Açık: <span className="font-semibold">{displayOpen}</span>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
              Kapalı: <span className="font-semibold">{displayClosed}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              className="w-72 max-w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
              placeholder="Ara: coin / CA"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            <select
              aria-label="Trade filtre"
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
              value={scope}
              onChange={(e) =>
                setScope(e.target.value as "all" | "open" | "closed")
              }
            >
              <option value="all">Hepsi</option>
              <option value="open">Sadece açık</option>
              <option value="closed">Sadece kapalı</option>
            </select>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto md:overflow-visible">
          <div className="flex flex-col gap-3 md:flex-col md:gap-3">
            {filtered.map((t) => {
            const caKey = t.ca.toLowerCase();
            const isOpen = t.exit_ts == null;

            const symbol = (
              t.coin_symbol ??
              symbolsByCa[t.ca.toLowerCase()] ??
              ""
            ).trim();

            const chain = (t.chain ?? chainsByCa[caKey] ?? "").trim();
            const dexUrl = dexUrlFor(chain || null, t.ca);

            const pnlPos = (t.pnl_pct ?? 0) > 0;
            const pnlNeg = (t.pnl_pct ?? 0) < 0;

            const logo = logoByCa[caKey];

              return (
                <article
                  key={t.trade_id}
                  className={[
                    "group relative overflow-hidden rounded-2xl border border-zinc-800/80",
                    "bg-linear-to-br from-zinc-950/70 via-zinc-950/40 to-zinc-900/40",
                    "p-3 md:p-4 transition hover:border-zinc-700",
                    "w-full",
                  ].join(" ")}
                >
                <div className="grid gap-3 md:grid-cols-[1.2fr_2.4fr_auto] md:items-center md:gap-4">
                  <div className="flex items-center gap-3">
                    {logo ? (
                      <Image
                        src={logo}
                        alt=""
                        width={LOGO_PX + 8}
                        height={LOGO_PX + 8}
                        className="rounded-full border border-zinc-800 bg-zinc-950 shrink-0"
                        style={{ width: LOGO_PX + 8, height: LOGO_PX + 8 }}
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
                        style={{ width: LOGO_PX + 8, height: LOGO_PX + 8 }}
                      />
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <a
                          href={dexUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-base font-semibold text-zinc-100 hover:underline"
                          title="Dexscreener'da ac"
                        >
                          {t.coin_name}
                        </a>
                        {symbol ? (
                          <span className="text-xs text-zinc-400">({symbol})</span>
                        ) : null}
                      </div>
                      <div className="mt-1">
                        <span
                          className={[
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px]",
                            isOpen
                              ? "border-emerald-900/40 bg-emerald-950/40 text-emerald-200"
                              : "border-rose-900/40 bg-rose-950/40 text-rose-200",
                          ].join(" ")}
                        >
                          {isOpen ? "Açık" : "Kapalı"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-3 md:gap-3">
                    <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-3 py-2">
                      <div className="text-[11px] text-zinc-500">Giris</div>
                      <div
                        className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-100"
                        title={fmtUsdTR(t.entry_mcap_usd)}
                      >
                        {fmtUsdTR(t.entry_mcap_usd)}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-400">
                        Tarih: {fmtDtTR(t.entry_ts)}
                      </div>
                      {t.size_usd != null ? (
                        <div className="mt-0.5 text-sm font-semibold text-zinc-100">
                          Miktar:{" "}
                          <span title={fmtUsdTR(t.size_usd)}>
                            {fmtUsdTR(t.size_usd)}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-3 py-2">
                      <div className="text-[11px] text-zinc-500">Çıkış</div>
                      <div
                        className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-100"
                        title={fmtUsdTR(t.exit_mcap_usd)}
                      >
                        {fmtUsdTR(t.exit_mcap_usd)}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-400">
                        Tarih: {fmtDtTR(t.exit_ts)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-3 py-2">
                      <div className="text-[11px] text-zinc-500">Kar</div>
                      <div
                        className={[
                          "mt-0.5 text-sm font-semibold tabular-nums",
                          pnlPos ? "text-emerald-300" : "",
                          pnlNeg ? "text-rose-300" : "",
                          !pnlPos && !pnlNeg ? "text-zinc-100" : "",
                        ].join(" ")}
                      >
                        {fmtPctSigned(t.pnl_pct)}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-400 tabular-nums">
                        Kar/Zarar: {t.pnl_usd == null ? "-" : fmtUsdFull(t.pnl_usd)}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-400">
                        Neden: {t.exit_reason?.trim() ? t.exit_reason : "-"}
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full flex-row gap-2 md:w-auto md:flex-col md:items-stretch">
                    {isOpen ? (
                      <button
                        className="h-7 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-100 hover:bg-zinc-900 text-center md:w-20 md:flex-none"
                        onClick={() => openCloseModal(t)}
                        type="button"
                      >
                        Kapat
                      </button>
                    ) : null}
                    <button
                      onClick={() => openEditModal(t)}
                      className="h-7 flex-1 rounded-lg border border-sky-900/60 bg-sky-950/50 px-2.5 py-1 text-[11px] text-sky-100 hover:bg-sky-900/60 text-center md:w-20 md:flex-none"
                      type="button"
                    >
                      Düzenle
                    </button>
                    <button
                      className="h-7 flex-1 rounded-lg border border-red-900/40 bg-red-950/40 px-2.5 py-1 text-[11px] text-red-100 hover:bg-red-900/60 text-center md:w-20 md:flex-none"
                      onClick={() => requestDeleteTrade(t.trade_id)}
                      type="button"
                    >
                      Sil
                    </button>
                  </div>
                </div>
                </article>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-8 text-center text-zinc-400">
              Kayıt yok.
            </div>
          ) : null}

          {nextCursor ? (
            <div className="mt-3 flex justify-center">
              <button
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-900 disabled:opacity-60"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                type="button"
              >
                {loadingMore ? "Yükleniyor…" : "Daha fazla"}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <Modal
        open={closeOpen}
        title="Trade kapat"
        onClose={() => setCloseOpen(false)}
      >
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-300">Çıkış MCAP (USD)</span>
            <input
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
              value={fmtDigitsTR(exitMcap)}
              onChange={(e) => setExitMcap(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              placeholder="500000"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-zinc-300">Çıkış Nedeni (opsiyonel)</span>
            <input
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
              value={exitReason}
              onChange={(e) => setExitReason(e.target.value)}
              placeholder="tp / sl / vibe / chart"
            />
          </label>

          <div className="flex gap-2 pt-1">
            <button
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              onClick={() => void submitClose()}
              disabled={loading}
              type="button"
            >
              Kaydet
            </button>
            <button
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800"
              onClick={() => setCloseOpen(false)}
              type="button"
            >
              Vazgeç
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        title="Trade sil"
        size="sm"
        onClose={() => {
          if (loading) return;
          setDeleteOpen(false);
          setDeleteTradeId(null);
        }}
      >
        <div className="grid gap-4">
          <div className="rounded-xl border border-red-900/40 bg-red-950/40 p-3 text-sm text-red-100">
            Bu trade silinecek. Bu işlem geri alinamaz.
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800"
              onClick={() => {
                setDeleteOpen(false);
                setDeleteTradeId(null);
              }}
              type="button"
              disabled={loading}
            >
              Vazgec
            </button>
            <button
              className="rounded-xl border border-red-900/40 bg-red-950/40 px-4 py-2 text-sm text-red-100 hover:bg-red-900/60 disabled:opacity-60"
              onClick={() => void confirmDeleteTrade()}
              type="button"
              disabled={loading}
            >
              {loading ? "Siliniyor..." : "Sil"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={editOpen}
        title="Trade düzenle"
        onClose={() => setEditOpen(false)}
      >
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-300">Çıkış MCAP (USD)</span>
            <input
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
              value={fmtDigitsTR(editExitMcap)}
              onChange={(e) =>
                setEditExitMcap(e.target.value.replace(/\D/g, ""))
              }
              inputMode="numeric"
              aria-label="Exit MCAP"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-zinc-300">Çıkış Nedeni (opsiyonel)</span>
            <input
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
              value={editExitReason}
              onChange={(e) => setEditExitReason(e.target.value)}
            />
          </label>

          <div className="flex gap-2 pt-1">
            <button
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              onClick={() => void submitEdit()}
              disabled={loading}
              type="button"
            >
              Kaydet
            </button>
            <button
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800"
              onClick={() => setEditOpen(false)}
              type="button"
            >
              Vazgec
            </button>
          </div>
        </div>
      </Modal>
    </main>
  );
}

