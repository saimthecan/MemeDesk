"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiGet, apiJson } from "@/lib/api";
import Image from "next/image";
import { FaXTwitter, FaTelegram } from "react-icons/fa6";
import LoadingScreen from "@/components/LoadingScreen";

type TipRow = {
  tip_id: number;
  ca: string;
  coin_name: string;

  coin_symbol?: string | null;
  chain?: string | null;

  account_id: number;
  platform: string;
  handle: string;

  post_ts: string | null;
  post_mcap_usd: number;

  peak_mcap_usd: number | null;
  trough_mcap_usd: number | null;

  rug_flag: number | null;

  gain_pct: number | null;
  drop_pct: number | null;
  effect_pct: number | null;
};

type CoinSummaryRow = {
  ca: string;
  symbol?: string | null;
  chain?: string | null;
};

type TipsPageResponse = {
  items: TipRow[];
  total_count: number;
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
  return `$${nfTr0.format(n)}`;
}

function fmtDigitsTR(value: string): string {
  if (!value) return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return nfTr0.format(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "-";
  return `${n.toFixed(2)}%`;
}

function fmtDtTR(s: string | null | undefined): string {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

// Dexscreener chainId mapping (API + URL path)
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

function dexUrlFor(chain: string | null | undefined, ca: string): string {
  const chainId = dexChainIdFor(chain);
  if (!chainId)
    return `https://dexscreener.com/search?q=${encodeURIComponent(ca)}`;
  return `https://dexscreener.com/${chainId}/${ca}`;
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
}) {
  if (!props.open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
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

type SortKey = "coin" | "post" | "peak" | "trough" | "effect" | "rug";
type SortDir = "asc" | "desc";

export default function TipsPage() {
  const PAGE_SIZE = 30;
  const [tips, setTips] = useState<TipRow[]>([]);
  const [symbolsByCa, setSymbolsByCa] = useState<Record<string, string>>({});
  const [chainsByCa, setChainsByCa] = useState<Record<string, string>>({});

  // logo cache
  const [logoByCa, setLogoByCa] = useState<Record<string, string>>({});
  const inflightLogosRef = useRef<Set<string>>(new Set()); // caKey

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [initialReady, setInitialReady] = useState(false);
  const initialReadyRef = useRef(false);

  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  const [sortKey, setSortKey] = useState<SortKey>("post");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // update modal
  const [updOpen, setUpdOpen] = useState(false);
  const [updTipId, setUpdTipId] = useState<number | null>(null);
  const [peakMcap, setPeakMcap] = useState<string>("");
  const [troughMcap, setTroughMcap] = useState<string>("");
  const [rugFlag, setRugFlag] = useState<string>("0"); // "0", "1"

  async function refresh(): Promise<void> {
    setLoading(true);
    setErr(null);
    setNextCursor(null);
    try {
      const qParam = qDebounced.trim() ? `&q=${encodeURIComponent(qDebounced.trim())}` : "";
      const [tipsRes, summaryRes] = await Promise.allSettled([
        apiGet<TipsPageResponse>(`/tips/paged?limit=${PAGE_SIZE}${qParam}`),
        apiGet<CoinSummaryRow[]>("/coins/summary"),
      ]);

      if (tipsRes.status === "fulfilled") {
        setTips(tipsRes.value.items);
        setNextCursor(tipsRes.value.next_cursor || null);
        setTotalCount(tipsRes.value.total_count);
      } else {
        throw tipsRes.reason;
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
  }

  async function loadMore(): Promise<void> {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setErr(null);
    try {
      const qParam = qDebounced.trim() ? `&q=${encodeURIComponent(qDebounced.trim())}` : "";
      const res = await apiGet<TipsPageResponse>(
        `/tips/paged?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}${qParam}`
      );
      setTips((prev) => [...prev, ...res.items]);
      setNextCursor(res.next_cursor || null);
      setTotalCount(res.total_count);
    } catch (e: unknown) {
      setErr(errMsg(e));
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [qDebounced]);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const platforms = useMemo(() => {
    const s = new Set<string>();
    tips.forEach((t) => s.add(t.platform));
    return Array.from(s).sort();
  }, [tips]);

  function toggleSort(k: SortKey) {
    if (sortKey !== k) {
      setSortKey(k);
      setSortDir("desc");
      return;
    }
    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
  }

  function sortIndicator(k: SortKey) {
    if (sortKey !== k) return null;
    return (
      <span className="ml-1 text-xs text-zinc-500">
        {sortDir === "desc" ? "↓" : "↑"}
      </span>
    );
  }

  const filtered = useMemo(() => {
    const needle = qDebounced.trim().toLowerCase();
    const base = tips.filter((t) => {
      if (platformFilter !== "all" && t.platform !== platformFilter)
        return false;
      if (!needle) return true;

      const sym = (
        t.coin_symbol ??
        symbolsByCa[t.ca.toLowerCase()] ??
        ""
      ).trim();
      const hay =
        `${t.coin_name} ${sym} ${t.handle} ${t.platform} ${t.tip_id} ${t.ca}`.toLowerCase();
      return hay.includes(needle);
    });

    const getNum = (n: number | null | undefined) =>
      n == null || !Number.isFinite(n) ? -Infinity : n;

    base.sort((a, b) => {
      let cmp = 0;

      if (sortKey === "coin") {
        const as = `${a.coin_name}`.toLowerCase();
        const bs = `${b.coin_name}`.toLowerCase();
        cmp = as.localeCompare(bs);
      } else if (sortKey === "post") {
        cmp = getNum(a.post_mcap_usd) - getNum(b.post_mcap_usd);
      } else if (sortKey === "peak") {
        cmp = getNum(a.peak_mcap_usd) - getNum(b.peak_mcap_usd);
      } else if (sortKey === "trough") {
        cmp = getNum(a.trough_mcap_usd) - getNum(b.trough_mcap_usd);
      } else if (sortKey === "effect") {
        cmp = getNum(a.effect_pct) - getNum(b.effect_pct);
      } else if (sortKey === "rug") {
        cmp = getNum(a.rug_flag) - getNum(b.rug_flag);
      }

      return sortDir === "asc" ? cmp : -cmp;
    });

    return base;
  }, [tips, qDebounced, platformFilter, symbolsByCa, sortKey, sortDir]);

  // visible rows için logo çek (cache + inflight guard + limit)
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const candidates: Array<{ ca: string; chain: string }> = [];
      const seen = new Set<string>();

      // sadece ekranda görünenler (filtered) üzerinden
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

        if (candidates.length >= 40) break; // çok istek atmayalım
      }

      for (const { ca, chain } of candidates) {
        const caKey = ca.toLowerCase();
        inflightLogosRef.current.add(caKey);

        try {
          const url = await fetchDexLogo(chain, ca);
          if (!cancelled && url) {
            setLogoByCa((m) => ({ ...m, [caKey]: url }));
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

  function clearFilters() {
    setQ("");
    setPlatformFilter("all");
  }

  function openUpdate(t: TipRow) {
    setUpdTipId(t.tip_id);
    setPeakMcap(t.peak_mcap_usd != null ? String(t.peak_mcap_usd) : "");
    setTroughMcap(t.trough_mcap_usd != null ? String(t.trough_mcap_usd) : "");
    setRugFlag(t.rug_flag != null ? String(t.rug_flag) : "0");
    setUpdOpen(true);
  }

  async function submitUpdate(): Promise<void> {
    const body: Record<string, unknown> = {};

    if (peakMcap.trim() !== "") {
      const v = Number(peakMcap);
      if (!Number.isFinite(v) || v < 0) return setErr("Peak MCAP geçersiz.");
      body.peak_mcap_usd = v;
    }
    if (troughMcap.trim() !== "") {
      const v = Number(troughMcap);
      if (!Number.isFinite(v) || v < 0) return setErr("Trough MCAP geçersiz.");
      body.trough_mcap_usd = v;
    }
    if (rugFlag === "0" || rugFlag === "1") {
      body.rug_flag = Number(rugFlag);
    }

    if (Object.keys(body).length === 0) {
      setErr("En az 1 alan gir.");
      return;
    }

    setLoading(true);
    setErr(null);
    try {
      await apiJson(`/tips/${updTipId}`, "PATCH", body);
      setUpdOpen(false);
      setUpdTipId(null);
      setPeakMcap("");
      setTroughMcap("");
      setRugFlag("");
      await refresh();
    } catch (e: unknown) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  async function deleteTip(tipId: number): Promise<void> {
    if (!confirm(`Emin misiniz? Bu tip silinecek: ${tipId}`)) {
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      await apiJson(`/tips/${tipId}`, "DELETE");
      await refresh();
    } catch (e: unknown) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  const isFiltered = q.trim() !== "" || platformFilter !== "all";
  const LOGO_PX = 40;

  if (!initialReady) {
    return (
      <LoadingScreen
        title="Tips yukleniyor"
        subtitle="Liste hazirlaniyor"
      />
    );
  }

  return (
    <main className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Influencer</h1>
          <p className="text-sm text-zinc-400">
            Burada sadece <span className="text-zinc-200">influencer</span>{" "}
            kayıtları var.
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
              Toplam:{" "}
              <span className="font-semibold">
                {totalCount ?? tips.length}
              </span>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
              Gösterilen:{" "}
              <span className="font-semibold">{filtered.length}</span>
            </div>

            {isFiltered ? (
              <button
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                onClick={clearFilters}
                type="button"
              >
                Filtreleri temizle
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              id="tips-search"
              className="w-72 max-w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
              placeholder="Ara: coin / symbol / handle / tip_id"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            <label className="sr-only" htmlFor="platform-filter">
              Platform filtresi
            </label>

            <select
              id="platform-filter"
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
            >
              <option value="all">Tüm platformlar</option>
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* SORT (chip buttons) */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(
            [
              ["coin", "Coin"],
              ["post", "Paylaşım"],
              ["peak", "Max"],
              ["trough", "Min"],
              ["effect", "Sonuç"],
              ["rug", "Rug"],
            ] as Array<[SortKey, string]>
          ).map(([k, label]) => {
            const active = sortKey === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleSort(k)}
                className={[
                  "rounded-full border px-3 py-1.5 text-sm transition",
                  "hover:bg-zinc-900",
                  active
                    ? "border-zinc-600 bg-zinc-950 text-zinc-100"
                    : "border-zinc-800 bg-zinc-950/40 text-zinc-300",
                ].join(" ")}
                title="Sıralamayı değiştir"
              >
                {label}
                {sortIndicator(k)}
              </button>
            );
          })}

          <div className="ml-auto hidden items-center gap-2 md:flex">
            <span className="text-xs text-zinc-500">
              Kart görünümü — responsive
            </span>
          </div>
        </div>

        {/* SPOTLIGHT CARDS */}
        <div className="mt-4 grid grid-cols-1 gap-4">
          {filtered.map((t) => {
            const caKey = t.ca.toLowerCase();
            const symbol = (t.coin_symbol ?? symbolsByCa[caKey] ?? "").trim();
            const chain = (t.chain ?? chainsByCa[caKey] ?? "").trim();
            const dexUrl = dexUrlFor(chain || null, t.ca);

            const profileUrl =
              t.platform === "twitter"
                ? `https://www.x.com/${t.handle}`
                : t.platform === "telegram"
                ? `https://t.me/${t.handle}`
                : null;

            const logo = logoByCa[caKey];

            return (
              <article
                key={t.tip_id}
                className={[
                  "group relative overflow-hidden rounded-2xl border border-zinc-800/80",
                  "bg-linear-to-br from-zinc-950/70 via-zinc-950/40 to-zinc-900/40",
                  "p-3 md:p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]",
                  "transition hover:border-zinc-700 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]",
                ].join(" ")}
              >
                <div className="grid gap-3 md:grid-cols-[1.4fr_1.6fr_auto] md:items-center md:gap-4">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="absolute -inset-4 rounded-full bg-emerald-400/10 blur-2xl transition-opacity group-hover:opacity-100 opacity-70" />
                      {logo ? (
                        <Image
                          src={logo}
                          alt=""
                          width={LOGO_PX + 6}
                          height={LOGO_PX + 6}
                          className="relative z-10 rounded-full border border-zinc-800 bg-zinc-950"
                          style={{ width: LOGO_PX + 6, height: LOGO_PX + 6 }}
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
                          className="relative z-10 rounded-full border border-zinc-800 bg-zinc-950"
                          style={{ width: LOGO_PX + 6, height: LOGO_PX + 6 }}
                        />
                      )}
                    </div>

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
                          <span className="shrink-0 text-xs text-zinc-400 font-medium">
                            {symbol}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 flex items-center gap-2 min-w-0">
                        {profileUrl ? (
                          <a
                            href={profileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-sm font-medium text-zinc-300 hover:underline"
                          >
                            @{t.handle}
                          </a>
                        ) : (
                          <span className="truncate text-sm font-medium text-zinc-300">
                            @{t.handle}
                          </span>
                        )}

                        {t.platform === "twitter" ? (
                          <span
                            title="twitter"
                            className="inline-flex items-center justify-center shrink-0 rounded-full border border-zinc-800 bg-zinc-950 p-1"
                          >
                            <FaXTwitter className="h-3 w-3 text-zinc-200" />
                          </span>
                        ) : t.platform === "telegram" ? (
                          <span
                            title="telegram"
                            className="inline-flex items-center justify-center shrink-0 rounded-full border border-zinc-800 bg-zinc-950 p-1"
                          >
                            <FaTelegram className="h-3 w-3 text-zinc-200" />
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span>{fmtDtTR(t.post_ts)}</span>
                        {t.rug_flag == null ? (
                          <span className="inline-flex items-center rounded-full border border-zinc-800/70 bg-zinc-950/40 px-2 py-0.5 text-[11px] text-zinc-300">
                            Rug: -
                          </span>
                        ) : t.rug_flag === 1 ? (
                          <span className="inline-flex items-center rounded-full border border-rose-900/40 bg-rose-950/40 px-2 py-0.5 text-[11px] text-rose-200">
                            Rug: 1
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-emerald-900/40 bg-emerald-950/40 px-2 py-0.5 text-[11px] text-emerald-200">
                            Rug: 0
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-[0.8fr_3.2fr] md:gap-12">
                    <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-3 py-2">
                      <div className="text-[11px] text-zinc-500">Post</div>
                      <div
                        className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-100"
                        title={fmtUsdFull(t.post_mcap_usd)}
                      >
                        {fmtUsdTR(t.post_mcap_usd)}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 md:gap-3">
                      <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-3 py-2">
                        <div className="text-[11px] text-zinc-500">Max</div>
                        <div
                          className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-100"
                          title={fmtUsdFull(t.peak_mcap_usd)}
                        >
                          {fmtUsdTR(t.peak_mcap_usd)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-emerald-300/80">
                          {fmtPct(t.gain_pct)}
                        </div>
                      </div>

                      <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-3 py-2">
                        <div className="text-[11px] text-zinc-500">Min</div>
                        <div
                          className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-100"
                          title={fmtUsdFull(t.trough_mcap_usd)}
                        >
                          {fmtUsdTR(t.trough_mcap_usd)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-rose-300/80">
                          {fmtPct(t.drop_pct)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-start md:justify-end">
                    <div className="flex w-full flex-row gap-2 md:w-auto md:flex-col md:items-stretch">
                      <button
                        className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-zinc-900 md:flex-none"
                        onClick={() => openUpdate(t)}
                        type="button"
                      >
                        Guncelle
                      </button>

                      <button
                        className="flex-1 rounded-lg border border-red-900/40 bg-red-950/50 px-3 py-1.5 text-xs font-medium text-red-100 transition hover:bg-red-900/60 md:flex-none"
                        onClick={() => deleteTip(t.tip_id)}
                        type="button"
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
                  <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
                  <div className="absolute -left-20 -bottom-24 h-64 w-64 rounded-full bg-sky-400/10 blur-3xl" />
                </div>
              </article>
            );
          })}
        </div>

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
      </section>

      {/* UPDATE MODAL */}
      <Modal
        open={updOpen}
        title="Tip Güncelle"
        onClose={() => setUpdOpen(false)}
      >
        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-200 mb-2">
              Peak MCAP
            </label>
            <input
              type="text"
              inputMode="numeric"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
              placeholder=""
              aria-label="Peak MCAP"
              value={fmtDigitsTR(peakMcap)}
              onChange={(e) =>
                setPeakMcap(e.target.value.replace(/\D/g, ""))
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-200 mb-2">
              Trough MCAP
            </label>
            <input
              type="text"
              inputMode="numeric"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
              placeholder=""
              aria-label="Trough MCAP"
              value={fmtDigitsTR(troughMcap)}
              onChange={(e) =>
                setTroughMcap(e.target.value.replace(/\D/g, ""))
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-200 mb-2">
              Rug Flag
            </label>
            <select
              title="Rug Durumu Seçin"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
              value={rugFlag}
              onChange={(e) => setRugFlag(e.target.value)}
            >
              <option value="0">0 - Rug Yok</option>
              <option value="1">1 - Rug Var</option>
            </select>
          </div>

          <div className="flex gap-2 pt-4">
            <button
              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-900"
              onClick={() => setUpdOpen(false)}
              type="button"
            >
              İptal
            </button>

            <button
              className="flex-1 rounded-lg border border-emerald-900/50 bg-emerald-950/40 px-3 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-900/60"
              onClick={() => submitUpdate()}
              type="button"
              disabled={loading}
            >
              {loading ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
