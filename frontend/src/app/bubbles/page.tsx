"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiJson } from "@/lib/api";
import LoadingScreen from "@/components/LoadingScreen";

type Context = { active_ca: string | null };

type Row = { rank: number; pct: number };

type BubblesResp = {
  ca: string;
  clusters: Row[];
  others: Row[];
};

function nextRank(rows: Row[]): number {
  if (rows.length === 0) return 1;
  return Math.max(...rows.map((r) => r.rank)) + 1;
}

export default function BubblesPage() {
  const [activeCa, setActiveCa] = useState<string | null>(null);
  const [clusters, setClusters] = useState<Row[]>([]);
  const [others, setOthers] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [initialReady, setInitialReady] = useState(false);
  const initialReadyRef = useRef(false);

  const clustersSorted = useMemo(
    () => [...clusters].sort((a, b) => a.rank - b.rank),
    [clusters]
  );
  const othersSorted = useMemo(
    () => [...others].sort((a, b) => a.rank - b.rank),
    [others]
  );

  async function refresh(): Promise<void> {
    setErr(null);
    try {
      const ctx = await apiGet<Context>("/context");
      setActiveCa(ctx.active_ca ?? null);

      if (ctx.active_ca) {
        // backend'de bubbles GET endpoint'in varsa burayı onunla değiştir.
        // Şimdilik snapshot'tan okuyalım:
        const snap = await apiGet<{ bubbles?: BubblesResp }>("/assistant_snapshot");
        const b = snap.bubbles;
        if (b && b.ca === ctx.active_ca) {
          setClusters(b.clusters ?? []);
          setOthers(b.others ?? []);
        } else {
          setClusters([]);
          setOthers([]);
        }
      } else {
        setClusters([]);
        setOthers([]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    } finally {
      if (!initialReadyRef.current) {
        initialReadyRef.current = true;
        setInitialReady(true);
      }
    }
  }

  function addClusterRow(): void {
    setClusters((prev) => [...prev, { rank: nextRank(prev), pct: 0 }]);
  }
  function addOtherRow(): void {
    setOthers((prev) => [...prev, { rank: nextRank(prev), pct: 0 }]);
  }

  function updateRow(
    kind: "clusters" | "others",
    idx: number,
    field: "rank" | "pct",
    value: string
  ): void {
    const num = Number(value);
    if (Number.isNaN(num)) return;

    if (kind === "clusters") {
      setClusters((prev) => {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], [field]: num } as Row;
        return copy;
      });
    } else {
      setOthers((prev) => {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], [field]: num } as Row;
        return copy;
      });
    }
  }

  function removeRow(kind: "clusters" | "others", idx: number): void {
    if (kind === "clusters") setClusters((prev) => prev.filter((_, i) => i !== idx));
    else setOthers((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save(): Promise<void> {
    setErr(null);
    setBusy(true);
    try {
      if (!activeCa) throw new Error("Active coin not set. Go Coins and set active.");

      // rank duplicate olmasın (DB UNIQUE)
      const checkDup = (rows: Row[]) => {
        const s = new Set<number>();
        for (const r of rows) {
          if (s.has(r.rank)) return true;
          s.add(r.rank);
        }
        return false;
      };
      if (checkDup(clusters) || checkDup(others)) {
        throw new Error("Duplicate rank var. Rank'ları benzersiz yap.");
      }

      await apiJson<{ ok: boolean }>("/bubbles/set", "POST", {
        ca: activeCa,
        clusters: clusters.map((r) => ({ rank: Number(r.rank), pct: Number(r.pct) })),
        others: others.map((r) => ({ rank: Number(r.rank), pct: Number(r.pct) })),
      });

      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (!initialReady) {
    return (
      <LoadingScreen
        title="Bubbles yukleniyor"
        subtitle="Aktif coin kontrol ediliyor"
      />
    );
  }

  return (
    <div>
      <h3>Bubbles</h3>

      {err && <pre style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{err}</pre>}

      <div style={{ marginBottom: 10 }}>
        <b>Active coin:</b> {activeCa || "(none)"}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => void refresh()} disabled={busy}>
          Refresh
        </button>
        <button onClick={() => void save()} disabled={busy || !activeCa}>
          Save (SET)
        </button>
        <button onClick={addClusterRow} disabled={!activeCa}>
          + Cluster row
        </button>
        <button onClick={addOtherRow} disabled={!activeCa}>
          + Other row
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ border: "1px solid #333", padding: 12, borderRadius: 8 }}>
          <h4 style={{ marginTop: 0 }}>Clusters</h4>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333" }}>Rank</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333" }}>Pct</th>
                <th style={{ borderBottom: "1px solid #333" }}></th>
              </tr>
            </thead>
            <tbody>
              {clustersSorted.map((r, idx) => (
                <tr key={`c-${idx}`}>
                  <td style={{ padding: "6px 0" }}>
                    <input
                      aria-label="cluster rank"
                      value={String(r.rank)}
                      onChange={(e) => updateRow("clusters", idx, "rank", e.target.value)}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td>
                    <input
                      aria-label="cluster pct"
                      value={String(r.pct)}
                      onChange={(e) => updateRow("clusters", idx, "pct", e.target.value)}
                      style={{ width: 120 }}
                    />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button onClick={() => removeRow("clusters", idx)} disabled={busy}>
                      X
                    </button>
                  </td>
                </tr>
              ))}
              {clustersSorted.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: "10px 0", opacity: 0.8 }}>
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ border: "1px solid #333", padding: 12, borderRadius: 8 }}>
          <h4 style={{ marginTop: 0 }}>Others</h4>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333" }}>Rank</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333" }}>Pct</th>
                <th style={{ borderBottom: "1px solid #333" }}></th>
              </tr>
            </thead>
            <tbody>
              {othersSorted.map((r, idx) => (
                <tr key={`o-${idx}`}>
                  <td style={{ padding: "6px 0" }}>
                    <input
                      aria-label="other rank"
                      value={String(r.rank)}
                      onChange={(e) => updateRow("others", idx, "rank", e.target.value)}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td>
                    <input
                      aria-label="other pct"
                      value={String(r.pct)}
                      onChange={(e) => updateRow("others", idx, "pct", e.target.value)}
                      style={{ width: 120 }}
                    />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button onClick={() => removeRow("others", idx)} disabled={busy}>
                      X
                    </button>
                  </td>
                </tr>
              ))}
              {othersSorted.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: "10px 0", opacity: 0.8 }}>
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 12, opacity: 0.8 }}>
        Not: Save (SET) basınca backend eski rows’u silip yenisini yazar. Satır sayısı istediğin kadar olabilir.
      </div>
    </div>
  );
}
