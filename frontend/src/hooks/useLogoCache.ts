import { useState, useRef, useEffect } from "react";
import { fetchDexLogo } from "../services/dexService";

export function useLogoCache(items: Array<{ ca: string; chain?: string | null }>) {
  const [logoByCa, setLogoByCa] = useState<Record<string, string>>({});
  const inflightLogosRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const candidates: Array<{ ca: string; chain: string }> = [];
      const seen = new Set<string>();

      for (const item of items) {
        const caKey = (item.ca || "").toLowerCase();
        if (!caKey) continue;

        const chain = (item.chain ?? "").trim();
        if (!chain) continue;

        if (logoByCa[caKey]) continue;
        if (inflightLogosRef.current.has(caKey)) continue;
        if (seen.has(caKey)) continue;

        seen.add(caKey);
        candidates.push({ ca: item.ca, chain });

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
  }, [items, logoByCa]);

  return logoByCa;
}
