"use client";

import { useEffect, useState } from "react";
import { apiGet, apiJson } from "@/lib/api";

type Context = { active_ca: string | null };

type ScoreRow = {
  id: number;
  ca: string;
  scored_ts: string;
  intuition_score: number;
};

export default function ScoringPage() {
  const [activeCa, setActiveCa] = useState<string | null>(null);
  const [score, setScore] = useState<number>(7);
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh(): Promise<void> {
    setErr(null);
    try {
      const ctx = await apiGet<Context>("/context");
      setActiveCa(ctx.active_ca ?? null);

      // scoring list: önce /scoring (GET) varsa onu kullan, yoksa snapshot'tan oku
      try {
        const list = await apiGet<ScoreRow[]>("/scoring");
        setRows(list);
      } catch {
        const snap = await apiGet<{ scoring?: ScoreRow[] }>("/assistant_snapshot");
        setRows(snap.scoring ?? []);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    }
  }

  async function add(): Promise<void> {
    setErr(null);
    setBusy(true);
    try {
      if (!activeCa) throw new Error("Active coin not set. Go Coins and set active.");
      if (score < 1 || score > 10) throw new Error("Score 1-10 arası olmalı.");

      await apiJson<{ ok: boolean; id: number }>("/scoring", "POST", {
        intuition_score: score,
        // backend'in ca'yı active'dan aldığını biliyoruz ama ileride güvenli olsun diye yolluyoruz
        ca: activeCa,
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

  return (
    <div>
      <h3>Scoring</h3>

      {err && <pre style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{err}</pre>}

      <div style={{ marginBottom: 10 }}>
        <b>Active coin:</b> {activeCa || "(none)"}
      </div>

      <div style={{ border: "1px solid #333", padding: 12, borderRadius: 8, maxWidth: 520 }}>
        <div style={{ marginBottom: 6 }}>Add intuition score (1–10)</div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            aria-label="intuition score"
            type="number"
            min={1}
            max={10}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            style={{ width: 120 }}
          />
          <button onClick={() => void add()} disabled={busy || !activeCa}>
            Add
          </button>
          <button onClick={() => void refresh()} disabled={busy}>
            Refresh
          </button>
        </div>
      </div>

      <h4 style={{ marginTop: 18 }}>Score history</h4>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #333" }}>Time</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #333" }}>CA</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #333" }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ padding: "6px 0" }}>{r.scored_ts}</td>
              <td>{r.ca}</td>
              <td>{r.intuition_score}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} style={{ padding: "10px 0", opacity: 0.8 }}>
                No scores yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}