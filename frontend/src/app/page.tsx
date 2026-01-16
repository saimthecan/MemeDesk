"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiJson } from "../lib/api";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FaXTwitter, FaTelegram } from "react-icons/fa6";
import LoadingScreen from "../components/LoadingScreen";

type TokenMeta = {
  name: string | null;
  symbol: string | null;
  launch_ts: string | null;
  pairs_found: number;
  chain: string | null;
};

type CoinSummary = {
  ca: string;
  name: string;
  symbol: string | null;
  launch_ts: string | null;
  source_type: "dex" | "influencer" | "both";
  created_ts: string | null;
  trades_total: number;
  trades_open: number;
  tips_total: number;
  last_activity_ts: string | null;
  chain?: string | null; // backend summary'e eklediysen
};

type Trade = {
  id: number;
  trade_id: string;
  ca: string;
  coin_name: string;
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

type Tip = {
  tip_id: number;
  ca: string;
  coin_name: string;
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

type BubbleRow = { rank: number; pct: number };

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function numOrNull(v: string): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

  // GG-AA-YYYY 18.32
  return `${dd}-${mm}-${yyyy} ${hh}.${mi}`;
}

function fmtUsd(n: number | null): string {
  if (n == null) return "-";
  const s = Math.round(n).toString();
  const dotted = s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$${dotted}`;
}

function onlyDigits(v: string): string {
  return v.replace(/[^\d]/g, "");
}

function fmtDots(v: string): string {
  const d = onlyDigits(v);
  if (!d) return "";
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function numFromDots(v: string): number | null {
  const d = onlyDigits(v);
  if (!d) return null;
  const n = Number(d);
  return Number.isFinite(n) ? n : null;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div className="w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
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

function BubbleEditor(props: {
  clusters: BubbleRow[];
  setClusters: (v: BubbleRow[]) => void;
  others: BubbleRow[];
  setOthers: (v: BubbleRow[]) => void;
}) {
  const [cRank, setCRank] = useState("");
  const [cPct, setCPct] = useState("");
  const [oRank, setORank] = useState("");
  const [oPct, setOPct] = useState("");

  function addCluster() {
    const rank = numOrNull(cRank);
    const pct = numOrNull(cPct);
    if (!rank || rank <= 0 || pct === null || pct < 0) return;
    const next = props.clusters
      .filter((x) => x.rank !== rank)
      .concat([{ rank, pct }])
      .sort((a, b) => a.rank - b.rank);
    props.setClusters(next);
    setCRank("");
    setCPct("");
  }

  function addOther() {
    const rank = numOrNull(oRank);
    const pct = numOrNull(oPct);
    if (!rank || rank <= 0 || pct === null || pct < 0) return;
    const next = props.others
      .filter((x) => x.rank !== rank)
      .concat([{ rank, pct }])
      .sort((a, b) => a.rank - b.rank);
    props.setOthers(next);
    setORank("");
    setOPct("");
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="text-sm font-medium text-zinc-200">
          Bubbles: Clusters
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            className="w-28 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-600"
            placeholder="Sıra"
            value={cRank}
            onChange={(e) => setCRank(e.target.value)}
          />
          <input
            className="w-28 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-600"
            placeholder="Yüzde"
            value={cPct}
            onChange={(e) => setCPct(e.target.value)}
          />
          <button
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
            onClick={addCluster}
            type="button"
          >
            Ekle
          </button>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          {props.clusters.length === 0 ? (
            <div className="text-sm text-zinc-400">
              Cluster yok (dinamik). İstersen ekle.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {props.clusters.map((x) => (
                <span
                  key={x.rank}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-sm"
                >
                  <span className="text-zinc-300">#{x.rank}</span>
                  <span className="text-zinc-200">{x.pct}%</span>
                  <button
                    className="text-zinc-400 hover:text-zinc-200"
                    onClick={() =>
                      props.setClusters(
                        props.clusters.filter((c) => c.rank !== x.rank)
                      )
                    }
                    type="button"
                    aria-label={`remove cluster ${x.rank}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="text-sm font-medium text-zinc-200">Bubbles: Others</div>

        <div className="flex flex-wrap gap-2">
          <input
            className="w-28 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-600"
            placeholder="Sıra"
            value={oRank}
            onChange={(e) => setORank(e.target.value)}
          />
          <input
            className="w-28 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-600"
            placeholder="Yüzde"
            value={oPct}
            onChange={(e) => setOPct(e.target.value)}
          />
          <button
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:bg-zinc-800"
            onClick={addOther}
            type="button"
          >
            Ekle
          </button>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          {props.others.length === 0 ? (
            <div className="text-sm text-zinc-400">
              Others yok (dinamik). İstersen ekle.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {props.others.map((x) => (
                <span
                  key={x.rank}
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-sm"
                >
                  <span className="text-zinc-300">#{x.rank}</span>
                  <span className="text-zinc-200">{x.pct}%</span>
                  <button
                    className="text-zinc-400 hover:text-zinc-200"
                    onClick={() =>
                      props.setOthers(
                        props.others.filter((c) => c.rank !== x.rank)
                      )
                    }
                    type="button"
                    aria-label={`remove other ${x.rank}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WorkspaceDashboard() {
  // Global lists
  const [coins, setCoins] = useState<CoinSummary[]>([]);
  const [openTrades, setOpenTrades] = useState<Trade[]>([]);
  const [tips, setTips] = useState<Tip[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warmingUp, setWarmingUp] = useState(false);
  const [warmupMsg, setWarmupMsg] = useState<string | null>(null);
  const [initialReady, setInitialReady] = useState(false);
  const initialReadyRef = useRef(false);

  // logo cache
  const [logoByCa, setLogoByCa] = useState<Record<string, string>>({});
  const inflightLogosRef = useRef<Set<string>>(new Set());
  const LOGO_PX = 32;

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      const [c, t, p] = await Promise.all([
        apiJson<CoinSummary[]>("/coins/summary"),
        apiJson<Trade[]>("/trades?only_open=true&limit=500"),
        apiJson<Tip[]>("/tips?limit=500"),
      ]);
      setCoins(c);
      setOpenTrades(t);
      setTips(p);
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

  async function warmupSystem() {
    if (warmingUp) return;
    setWarmingUp(true);
    setWarmupMsg(null);
    setError(null);

    try {
      const res = await fetch("/api/warmup", {
        method: "POST",
        cache: "no-store",
      });
      const txt = await res.text();
      if (!res.ok) throw new Error(`Warmup failed (${res.status}): ${txt}`);
      setWarmupMsg("Sistem uyandı ✅");
    } catch (e: unknown) {
      setWarmupMsg(null);
      setError(errMsg(e));
    } finally {
      setWarmingUp(false);
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  // Add coin (Dex meta)
  const [caInput, setCaInput] = useState("");
  const caInputRef = useRef<HTMLInputElement | null>(null);
  const ca = caInput.trim().toLowerCase();

  const [meta, setMeta] = useState<TokenMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const metaReqRef = useRef(0);

  const [manualName, setManualName] = useState("");
  const [manualSymbol, setManualSymbol] = useState("");
  const [manualLaunchTs, setManualLaunchTs] = useState(""); // datetime-local

  async function fetchMeta(caOverride?: string) {
    const raw = (caOverride ?? caInputRef.current?.value ?? caInput).trim();
    if (!raw) return;

    const caQ = raw.toLowerCase();

    // paste+click aynı anda olunca state bir tick geriden gelebiliyor; input değeriyle senkron tut
    if (raw !== caInput) setCaInput(raw);

    const reqId = ++metaReqRef.current;

    setMetaLoading(true);
    setError(null);

    try {
      const m = await apiJson<TokenMeta>(
        `/dexscreener/token_meta?ca=${encodeURIComponent(caQ)}`
      );

      // daha yeni bir request başladıysa eski sonucu ignore et
      if (reqId !== metaReqRef.current) return;

      setMeta(m);

      // her seferinde güncelle
      setManualName(m?.name ?? "");
      setManualSymbol(m?.symbol ?? "");

      if (m?.launch_ts) {
        const d = new Date(m.launch_ts);
        if (!Number.isNaN(d.getTime())) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          const hh = String(d.getHours()).padStart(2, "0");
          const mi = String(d.getMinutes()).padStart(2, "0");
          setManualLaunchTs(`${yyyy}-${mm}-${dd}T${hh}:${mi}`);
        } else {
          setManualLaunchTs("");
        }
      } else {
        setManualLaunchTs("");
      }
    } catch (e: unknown) {
      if (reqId !== metaReqRef.current) return;
      setError(errMsg(e));
    } finally {
      if (reqId === metaReqRef.current) setMetaLoading(false);
    }
  }

  const coinDraft = useMemo(() => {
    return {
      ca,
      name: manualName.trim() || null,
      symbol: manualSymbol.trim() || null,
      launch_ts: manualLaunchTs ? new Date(manualLaunchTs).toISOString() : null,
      chain: meta?.chain || "unknown",
    };
  }, [ca, manualName, manualSymbol, manualLaunchTs, meta?.chain]);

  // Common extras
  const [clusters, setClusters] = useState<BubbleRow[]>([]);
  const [others, setOthers] = useState<BubbleRow[]>([]);
  const [intuitionScore, setIntuitionScore] = useState<number>(5);
  function resetExtras() {
    setClusters([]);
    setOthers([]);
    setIntuitionScore(5);
  }

  // Dex modal
  const [dexOpen, setDexOpen] = useState(false);
  const [entryMcap, setEntryMcap] = useState("");
  const [sizeUsd, setSizeUsd] = useState("");

  async function submitDex() {
    if (!ca) return setError("CA boş olamaz");
    const entry = numFromDots(entryMcap);
    if (!entry || entry <= 0) return setError("Entry MCAP zorunlu");

    setLoading(true);
    setError(null);

    try {
      const body = {
        ...coinDraft,
        entry_mcap_usd: entry,
        size_usd: numFromDots(sizeUsd),
        bubbles: { clusters, others },
        intuition_score: intuitionScore,
      };

      await apiJson("/wizard/dex_add", "POST", body);

      setDexOpen(false);
      setEntryMcap("");
      setSizeUsd("");
      resetExtras();
      await refreshAll();
    } catch (e: unknown) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  // Influencer modal
  const [infOpen, setInfOpen] = useState(false);
  const [platform, setPlatform] = useState("twitter");
  const [handle, setHandle] = useState("");
  const [postTs, setPostTs] = useState("");
  const [postMcap, setPostMcap] = useState("");

  async function submitInfluencer() {
    if (!ca) return setError("CA boş olamaz");
    if (!handle.trim()) return setError("Handle zorunlu");

    const pm = numFromDots(postMcap);
    if (!pm || pm <= 0) return setError("Post MCAP zorunlu");
    if (!postTs) return setError("Post tarihi zorunlu");

    setLoading(true);
    setError(null);
    try {
      await apiJson("/wizard/influencer_add", "POST", {
        ...coinDraft,
        platform,
        handle: handle.trim(),
        post_ts: new Date(postTs).toISOString(),
        post_mcap_usd: pm,
        bubbles: { clusters, others },
        intuition_score: intuitionScore,
      });

      setInfOpen(false);
      setHandle("");
      setPostTs("");
      setPostMcap("");
      resetExtras();
      await refreshAll();
    } catch (e: unknown) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  // Close trade modal
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeTradeId, setCloseTradeId] = useState<string | null>(null);
  const [exitMcap, setExitMcap] = useState("");
  const [exitReason, setExitReason] = useState("");

  async function submitClose() {
    if (!closeTradeId) return;
    const ex = numFromDots(exitMcap);
    if (!ex || ex <= 0) return setError("Exit MCAP zorunlu");

    setLoading(true);
    setError(null);
    try {
      await apiJson("/trades/close", "POST", {
        trade_id: closeTradeId,
        exit_mcap_usd: ex,
        exit_reason: exitReason || null,
      });

      setCloseOpen(false);
      setCloseTradeId(null);
      setExitMcap("");
      setExitReason("");
      await refreshAll();
    } catch (e: unknown) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  //tips
  const router = useRouter();

  const PREVIEW_COUNT = 3;
  const openTradesPreview = openTrades.slice(0, PREVIEW_COUNT);
  const remaining = Math.max(0, openTrades.length - PREVIEW_COUNT);

  const PREVIEW_TIPS = 3;
  const tipsPreview = tips.slice(0, PREVIEW_TIPS);
  const remainingTips = Math.max(0, tips.length - PREVIEW_TIPS);

  // visible rows için logo çek (cache + inflight guard + limit)
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const candidates: Array<{ ca: string; chain: string }> = [];
      const seen = new Set<string>();

      for (const t of openTradesPreview) {
        const caKey = (t.ca || "").toLowerCase();
        if (!caKey) continue;

        const c = coins.find((x) => x.ca === t.ca);
        const chain = (t.chain ?? c?.chain ?? "").trim();
        if (!chain) continue;

        if (logoByCa[caKey]) continue;
        if (inflightLogosRef.current.has(caKey)) continue;
        if (seen.has(caKey)) continue;

        seen.add(caKey);
        candidates.push({ ca: t.ca, chain });

        if (candidates.length >= 40) break;
      }

      for (const t of tipsPreview) {
        const caKey = (t.ca || "").toLowerCase();
        if (!caKey) continue;

        const c = coins.find((x) => x.ca === t.ca);
        const chain = (c?.chain ?? "").trim();
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
  }, [openTradesPreview, tipsPreview, coins, logoByCa]);

  // Snapshot copy
  const [snapshotCa, setSnapshotCa] = useState<string>("");
  const [singleCoinMode, setSingleCoinMode] = useState(false);

  useEffect(() => {
  if (!singleCoinMode) setSnapshotCa("");
}, [singleCoinMode]);



  const snapshotUrl = useMemo(() => {
    const base = "/assistant_snapshot?limit=500";
    return snapshotCa ? `${base}&ca=${encodeURIComponent(snapshotCa)}` : base;
  }, [snapshotCa]);

  const [snapshotPending, setSnapshotPending] = useState<
    null | "copy" | "download"
  >(null);

  const isSnapshotCopying = snapshotPending === "copy";
  const isSnapshotDownloading = snapshotPending === "download";
  const isSnapshotBusy = snapshotPending !== null;

  async function copySnapshot(): Promise<void> {
  if (isSnapshotBusy) return;

  setSnapshotPending("copy");
  setError(null);

  try {
    const snap = await apiJson(snapshotUrl);
    await navigator.clipboard.writeText(JSON.stringify(snap, null, 2));
    alert("Snapshot kopyalandı");
  } catch (e: unknown) {
    setError(errMsg(e));
  } finally {
    setSnapshotPending(null);
  }
}

async function downloadSnapshot(): Promise<void> {
  if (isSnapshotBusy) return;

  setSnapshotPending("download");
  setError(null);

  try {
    const snap = await apiJson(snapshotUrl);
    const text = JSON.stringify(snap, null, 2);

    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const safeCa = snapshotCa.trim().replace(/[^a-zA-Z0-9_-]+/g, "_");
    const filename = safeCa ? `snapshot_${safeCa}.json` : "snapshot.json";

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  } catch (e: unknown) {
    setError(errMsg(e));
  } finally {
    setSnapshotPending(null);
  }
}

  const openTradesCount = useMemo(() => {
    return coins.reduce((acc, c) => acc + (c.trades_open || 0), 0);
  }, [coins]);

  if (!initialReady) {
    return (
      <LoadingScreen
        title="Dashboard yukleniyor"
        subtitle="Ozet ve listeler hazirlaniyor"
      />
    );
  }

  return (
    <main className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Dashboard</h1>
          <p className="text-sm text-zinc-400">
            Detaylı coin listesi{" "}
            <Link className="underline" href="/coins">
              Coins
            </Link>{" "}
            sekmesinde.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-60"
            onClick={refreshAll}
            disabled={loading}
            type="button"
          >
            Yenile
          </button>
          <button
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-60"
            onClick={() => void warmupSystem()}
            disabled={warmingUp}
            type="button"
            title="Render + Neon uyandırır"
          >
            {warmingUp ? "Uyandırılıyor…" : "Sistemi uyandır"}
          </button>
        </div>
      </div>

      {warmupMsg ? (
        <div className="text-xs text-zinc-400">{warmupMsg}</div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-900/70 bg-rose-950/40 p-4 text-sm text-rose-100">
          <div className="font-semibold">Hata</div>
          <div className="mt-1 whitespace-pre-wrap text-rose-200">{error}</div>
        </div>
      ) : null}

      <div className="grid grid-cols-12 gap-4">
        {/* Coin add */}
        <section className="col-span-12 lg:col-span-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-zinc-100">Coin ekle</h2>

            {meta ? (
              <span className="text-xs text-zinc-400">
                Network: {meta.chain || "unknown"}
              </span>
            ) : null}
          </div>

          <div className="mt-3 grid gap-3">
            <div className="flex flex-wrap gap-2">
              <input
                className="w-full max-w-xl rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
                placeholder="CA (contract address)"
                ref={caInputRef}
                value={caInput}
                onChange={(e) => {
                  const v = e.target.value;
                  setCaInput(v);
                  // CA değişince önceki coinin meta/verilerini ekranda tutma
                  metaReqRef.current += 1;
                  setMetaLoading(false);
                  setMeta(null);
                  setManualName("");
                  setManualSymbol("");
                  setManualLaunchTs("");
                }}
              />
              <button
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm hover:bg-zinc-900 disabled:opacity-60"
                onClick={() => fetchMeta()}
                disabled={!ca || metaLoading}
                type="button"
              >
                {metaLoading ? "Çekiliyor…" : "Dexscreener'dan çek"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-sm">
                <span className="text-zinc-300">İsim</span>
                <input
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-zinc-300">Symbol</span>
                <input
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
                  value={manualSymbol}
                  onChange={(e) => setManualSymbol(e.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-zinc-300">Launch (TR saati)</span>
                <input
                  type="datetime-local"
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
                  value={manualLaunchTs}
                  onChange={(e) => setManualLaunchTs(e.target.value)}
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                onClick={() => setDexOpen(true)}
                disabled={!ca}
                type="button"
              >
                Trade Aç
              </button>
              <button
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm hover:bg-zinc-900 disabled:opacity-60"
                onClick={() => setInfOpen(true)}
                disabled={!ca}
                type="button"
              >
                Influencer ekle
              </button>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="col-span-12 lg:col-span-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="text-base font-semibold text-zinc-100">Özet</div>

          <div className="mt-3 grid gap-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs text-zinc-400">Toplam coin</div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">
                {coins.length}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs text-zinc-400">Açık trade</div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">
                {openTradesCount}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <div className="text-xs text-zinc-400">Toplam tip</div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">
                {tips.length}
              </div>
            </div>
          </div>
        </section>

        {/* Open trades */}
        <section className="col-span-12 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-zinc-100">
              Açık Trades ({openTrades.length})
            </h2>
          </div>

          <div className="mt-3 overflow-auto rounded-2xl border border-zinc-800">
            <table className="min-w-225 w-full text-left text-sm">
              <thead className="bg-zinc-950 text-zinc-300">
                <tr>
                  <th className="px-4 py-3">Coin</th>
                  <th className="px-4 py-3">Entry</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Entry TS</th>
                  <th className="px-4 py-3">Aksiyon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {openTrades.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-zinc-400" colSpan={5}>
                      Açık trade yok.
                    </td>
                  </tr>
                ) : (
                  <>
                    {openTradesPreview.map((t) => {
                      const c = coins.find((x) => x.ca === t.ca);
                      const dexUrl = dexUrlFor(t.chain ?? c?.chain, t.ca);

                      const caKey = t.ca.toLowerCase();
                      const logo = logoByCa[caKey];

                      return (
                        <tr key={t.trade_id} className="bg-zinc-900/10">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
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
                                className="font-semibold text-zinc-100 underline decoration-zinc-800 hover:decoration-zinc-300"
                                title="Dexscreener"
                              >
                                {t.coin_name}
                              </a>
                            </div>

                            {/* chain bilgisi kaldırıldı */}
                          </td>

                          <td className="px-4 py-3 text-zinc-200">
                            {fmtUsd(t.entry_mcap_usd)}
                          </td>
                          <td className="px-4 py-3 text-zinc-200">
                            {fmtUsd(t.size_usd)}
                          </td>
                          <td className="px-4 py-3 text-zinc-200">
                            {fmtTsTR(t.entry_ts)}
                          </td>

                          <td className="px-4 py-3">
                            <button
                              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-900"
                              onClick={() => {
                                setCloseTradeId(t.trade_id);
                                setCloseOpen(true);
                              }}
                              type="button"
                            >
                              Kapat
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {remaining > 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => router.push("/trades")}
                            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-950"
                          >
                            Devamını gör ({remaining})
                          </button>
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Tips */}
        <section className="col-span-12 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-zinc-100">
              Influencer ({tips.length})
            </h2>
          </div>

          <div className="mt-3 overflow-x-auto overflow-y-hidden no-scrollbar rounded-2xl border border-zinc-800">
            <table className="min-w-275 w-full text-left text-sm">
              <thead className="bg-zinc-950 text-zinc-300">
                <tr>
                  <th className="px-4 py-3">Coin</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Post Zamanı</th>
                  <th className="px-4 py-3">Post MCAP</th>
                  <th className="px-4 py-3">Max</th>
                  <th className="px-4 py-3">Min</th>
                  <th className="px-4 py-3">Kazanç</th>
                  <th className="px-4 py-3">Rug</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-800">
                {tips.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-zinc-400" colSpan={8}>
                      Tip yok.
                    </td>
                  </tr>
                ) : (
                  <>
                    {tipsPreview.map((t) => {
                      const c = coins.find((x) => x.ca === t.ca);
                      const dexUrl = dexUrlFor(c?.chain, t.ca);

                      const caKey = t.ca.toLowerCase();
                      const logo = logoByCa[caKey];

                      const profileUrl =
                        t.platform === "twitter"
                          ? `https://www.x.com/${t.handle}`
                          : t.platform === "telegram"
                          ? `https://t.me/${t.handle}`
                          : null;

                      return (
                        <tr key={t.tip_id} className="bg-zinc-900/10">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
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
                                className="font-semibold text-zinc-100 underline decoration-zinc-800 hover:decoration-zinc-300"
                                title="Dexscreener"
                              >
                                {t.coin_name}
                              </a>
                            </div>

                            {/* chain bilgisi kaldırıldı */}
                          </td>

                          {/* Account (twitter/telegram ikonlu) */}
                          <td className="px-4 py-3 text-zinc-200">
                            <div className="font-medium flex items-center gap-2">
                              {profileUrl ? (
                                <a
                                  href={profileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:underline"
                                >
                                  @{t.handle}
                                </a>
                              ) : (
                                <span>@{t.handle}</span>
                              )}

                              {t.platform === "twitter" ? (
                                <span
                                  title="twitter"
                                  className="inline-flex items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 p-1.5 text-zinc-200"
                                >
                                  <FaXTwitter className="h-4 w-4" />
                                </span>
                              ) : t.platform === "telegram" ? (
                                <span
                                  title="telegram"
                                  className="inline-flex items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 p-1.5 text-zinc-200"
                                >
                                  <FaTelegram className="h-4 w-4" />
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-400">
                                  ({t.platform})
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3 text-zinc-200">
                            {fmtTsTR(t.post_ts)}
                          </td>

                          <td className="px-4 py-3 text-zinc-200">
                            {fmtUsd(t.post_mcap_usd)}
                          </td>

                          <td className="px-4 py-3 text-zinc-200">
                            {fmtUsd(t.peak_mcap_usd)}
                          </td>

                          <td className="px-4 py-3 text-zinc-200">
                            {fmtUsd(t.trough_mcap_usd)}
                          </td>

                          <td className="px-4 py-3 text-zinc-200">
                            {t.gain_pct == null
                              ? "-"
                              : `${Math.round(t.gain_pct)}%`}
                          </td>

                          <td className="px-4 py-3 text-zinc-200">
                            {t.rug_flag == null ? "-" : t.rug_flag ? "✅" : "—"}
                          </td>
                        </tr>
                      );
                    })}

                    {remainingTips > 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => router.push("/tips")}
                            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-950"
                          >
                            Devamını gör ({remainingTips})
                          </button>
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Snapshot */}
        <section className="col-span-12 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-zinc-100">Snapshot</h2>
          </div>
<div className="mt-3 flex flex-wrap items-center gap-2">
  {/* Checkbox her zaman görünsün */}
  <label className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
    <input
      type="checkbox"
      className="h-4 w-4 accent-zinc-200"
      checked={singleCoinMode}
      onChange={(e) => setSingleCoinMode(e.target.checked)}
      disabled={isSnapshotBusy}
    />
    Tek Coin
  </label>

  {/* Tek coin modu KAPALIYKEN: Snapshot indir görünsün */}
  {!singleCoinMode ? (
    <button
      type="button"
      onClick={() => void downloadSnapshot()}
      disabled={isSnapshotBusy}
      className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-900 disabled:opacity-60"
    >
      {isSnapshotDownloading ? "İndiriliyor…" : "Snapshot indir"}
    </button>
  ) : null}

  {/* Tek coin modu AÇIKKEN: CA + Snapshot kopyala görünsün */}
  {singleCoinMode ? (
    <>
      <input
       className="flex-1 min-w-65 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
        placeholder="CA gir (tek coin için)"
        value={snapshotCa}
        onChange={(e) => setSnapshotCa(e.target.value)}
        disabled={isSnapshotBusy}
      />

      <button
        type="button"
        onClick={() => void copySnapshot()}
        disabled={isSnapshotBusy || snapshotCa.trim() === ""}
        className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-900 disabled:opacity-60"
      >
        {isSnapshotCopying ? "Kopyalanıyor…" : "Snapshot kopyala"}
      </button>
    </>
  ) : null}
</div>

        </section>
      </div>

      {/* DEX modal */}
      <Modal
        open={dexOpen}
        title="Trade Aç (DEX)"
        onClose={() => setDexOpen(false)}
      >
        <div className="grid gap-4">
          <div className="grid gap-1">
            <div className="text-sm font-medium text-zinc-200">Coin</div>
            <a
              href={dexUrlFor(meta?.chain, ca)}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-zinc-100 underline decoration-zinc-700 hover:decoration-zinc-300"
              title="Dexscreener"
            >
              {manualName || meta?.name || "Unknown"}
              {manualSymbol || meta?.symbol
                ? ` (${manualSymbol || meta?.symbol})`
                : ""}
            </a>
            <div className="text-sm text-zinc-400">
              Network: {meta?.chain || "unknown"}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-zinc-300">Entry MCAP (USD)</span>
              <input
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
                placeholder="Örn: 1.000.000"
                value={entryMcap}
                onChange={(e) => setEntryMcap(fmtDots(e.target.value))}
                inputMode="numeric"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-zinc-300">Size (USD) (opsiyonel)</span>
              <input
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
                placeholder="Örn: 10.000 (opsiyonel)"
                value={sizeUsd}
                onChange={(e) => setSizeUsd(fmtDots(e.target.value))}
                inputMode="numeric"
              />
            </label>
          </div>

          <BubbleEditor
            clusters={clusters}
            setClusters={setClusters}
            others={others}
            setOthers={setOthers}
          />

          <label className="grid gap-1 text-sm">
            <span className="text-zinc-300">Intuition score (1-10)</span>
            <input
              type="range"
              min={1}
              max={10}
              value={intuitionScore}
              onChange={(e) => setIntuitionScore(Number(e.target.value))}
            />
            <div className="text-xs text-zinc-400">{intuitionScore}</div>
          </label>

          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm hover:bg-zinc-900"
              onClick={() => setDexOpen(false)}
              type="button"
            >
              İptal
            </button>
            <button
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              onClick={submitDex}
              disabled={loading}
              type="button"
            >
              Kaydet
            </button>
          </div>
        </div>
      </Modal>

      {/* Influencer modal */}
      <Modal
        open={infOpen}
        title="Influencer ekle"
        onClose={() => setInfOpen(false)}
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-zinc-300">Platform</span>
              <select
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                <option value="twitter">twitter</option>
                <option value="telegram">telegram</option>
                <option value="tiktok">tiktok</option>
                <option value="youtube">youtube</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-zinc-300">Handle</span>
              <input
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-zinc-300">Post tarihi</span>
              <input
                type="datetime-local"
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
                value={postTs}
                onChange={(e) => setPostTs(e.target.value)}
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-zinc-300">Post MCAP (USD)</span>
              <input
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
                value={postMcap}
                onChange={(e) => setPostMcap(fmtDots(e.target.value))}
                inputMode="numeric"
              />
            </label>
          </div>

          <BubbleEditor
            clusters={clusters}
            setClusters={setClusters}
            others={others}
            setOthers={setOthers}
          />

          <label className="grid gap-1 text-sm">
            <span className="text-zinc-300">Intuition score (1-10)</span>
            <input
              type="range"
              min={1}
              max={10}
              value={intuitionScore}
              onChange={(e) => setIntuitionScore(Number(e.target.value))}
            />
            <div className="text-xs text-zinc-400">{intuitionScore}</div>
          </label>

          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm hover:bg-zinc-900"
              onClick={() => setInfOpen(false)}
              type="button"
            >
              İptal
            </button>
            <button
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              onClick={submitInfluencer}
              disabled={loading}
              type="button"
            >
              Kaydet
            </button>
          </div>
        </div>
      </Modal>

      {/* Close modal */}
      <Modal
        open={closeOpen}
        title="Trade kapat"
        onClose={() => setCloseOpen(false)}
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-zinc-300">Exit MCAP (USD)</span>
              <input
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
                value={exitMcap}
                onChange={(e) => setExitMcap(fmtDots(e.target.value))}
                inputMode="numeric"
              />
            </label>

            <label className="grid gap-1 text-sm">
              <span className="text-zinc-300">Exit reason (opsiyonel)</span>
              <input
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm outline-none focus:border-zinc-600"
                value={exitReason}
                onChange={(e) => setExitReason(e.target.value)}
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm hover:bg-zinc-900"
              onClick={() => setCloseOpen(false)}
              type="button"
            >
              İptal
            </button>
            <button
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              onClick={submitClose}
              disabled={loading}
              type="button"
            >
              Kapat
            </button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
