"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet } from "@/lib/api";
import LoadingScreen from "@/components/LoadingScreen";

type Snapshot = Record<string, unknown>;

export default function SnapshotPage() {
  const [txt, setTxt] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [initialReady, setInitialReady] = useState(false);
  const initialReadyRef = useRef(false);

  async function load(): Promise<void> {
    setErr(null);
    try {
      const data = await apiGet<Snapshot>("/assistant_snapshot");
      setTxt(JSON.stringify(data, null, 2));
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

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(txt);
    alert("Snapshot kopyalandı.");
  }

  useEffect(() => {
    void load();
  }, []); // burada disable gerekmez

  if (!initialReady) {
    return (
      <LoadingScreen
        title="Snapshot yükleniyor"
        subtitle="Veri hazırlanıyor"
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Assistant Snapshot</h3>
        <span
          title="Snapshot, açık trade ve alpha calls gibi anlık verilerin ham JSON kaydıdır."
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: "1px solid #3f3f46",
            background: "#0f172a",
            color: "#e5e7eb",
            fontSize: 12,
            fontWeight: 600,
            lineHeight: "20px",
            cursor: "pointer",
            userSelect: "none",
          }}
          aria-label="Snapshot info"
        >
          i
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button onClick={() => void load()}>Refresh</button>
        <button onClick={() => void copy()} disabled={!txt}>
          Copy
        </button>
      </div>

      {err && <pre style={{ color: "crimson" }}>{err}</pre>}

      <label style={{ display: "block" }}>
        <span style={{ display: "block", marginBottom: 6 }}>Snapshot JSON</span>
        <textarea
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          style={{
            width: "100%",
            height: 520,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        />
      </label>
    </div>
  );
}
