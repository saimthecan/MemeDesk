import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { errMsg } from "../utils/errors";

type Opts = {
  setLoading?: (v: boolean) => void;
  setError?: (v: string | null) => void;
};

export function useListWithCoinSummary<T>(listPath: string, opts: Opts = {}) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoadingInternal] = useState(false);
  const [error, setErrorInternal] = useState<string | null>(null);

  const [symbolsByCa, setSymbolsByCa] = useState<Record<string, string>>({});
  const [chainsByCa, setChainsByCa] = useState<Record<string, string>>({});

  const setLoading = useCallback(
    (v: boolean) => {
      setLoadingInternal(v);
      opts.setLoading?.(v);
    },
    [opts]
  );

  const setError = useCallback(
    (v: string | null) => {
      setErrorInternal(v);
      opts.setError?.(v);
    },
    [opts]
  );

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const [listRes, summaryRes] = await Promise.allSettled([
        apiGet<T[]>(listPath),
        apiGet<
          Array<{ ca: string | null; symbol?: string | null; chain?: string | null }>
        >("/coins/summary"),
      ]);

      if (listRes.status === "fulfilled") {
        setData(listRes.value);
      } else {
        throw listRes.reason;
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
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [listPath, setError, setLoading]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh, symbolsByCa, chainsByCa };
}
