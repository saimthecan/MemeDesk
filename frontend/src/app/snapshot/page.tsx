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
        title="Snapshot yukleniyor"
        subtitle="Veri hazirlaniyor"
      />
    );
  }

  return (
    <div>
      <h3>Assistant Snapshot</h3>

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
