import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { fetchDexLogo } from "../services/dexscreener";

type LogoMap = Record<string, string>;

type Options<T> = {
  getCa: (item: T) => string | null | undefined;
  getChain: (item: T) => string | null | undefined;
  deps?: unknown[];
  limit?: number;
};

export function useDexLogos<T>(
  items: T[],
  options: Options<T>
): { logoByCa: LogoMap; setLogoByCa: Dispatch<SetStateAction<LogoMap>> } {
  const { deps = [], limit = 40 } = options;

  const getCaRef = useRef(options.getCa);
  const getChainRef = useRef(options.getChain);

  useEffect(() => {
    getCaRef.current = options.getCa;
    getChainRef.current = options.getChain;
  }, [options.getCa, options.getChain]);

  const [logoByCa, setLogoByCa] = useState<LogoMap>({});
  const inflightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const candidates: Array<{ ca: string; chain: string }> = [];
      const seen = new Set<string>();

      for (const it of items) {
        const ca = getCaRef.current(it);
        const caKey = (ca || "").toLowerCase();
        if (!caKey) continue;

        const chain = (getChainRef.current(it) || "").trim();
        if (!chain) continue;

        if (logoByCa[caKey]) continue;
        if (inflightRef.current.has(caKey)) continue;
        if (seen.has(caKey)) continue;

        seen.add(caKey);
        candidates.push({ ca: ca!, chain });

        if (candidates.length >= limit) break;
      }

      for (const c of candidates) {
        const caKey = c.ca.toLowerCase();
        inflightRef.current.add(caKey);

        try {
          const logo = await fetchDexLogo(c.chain, c.ca);
          if (!cancelled && logo) {
            setLogoByCa((m) => (m[caKey] ? m : { ...m, [caKey]: logo }));
          }
        } catch {
          // ignore
        } finally {
          inflightRef.current.delete(caKey);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, logoByCa, limit, ...deps]);

  return { logoByCa, setLogoByCa };
}
