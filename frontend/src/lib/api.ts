export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

async function warmupBackend(): Promise<boolean> {
  try {
    const res = await fetch("/api/warmup", { method: "POST", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

function shouldRetryWarmup(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  if (e instanceof Error && e.message.includes("Failed to fetch")) return true;
  return false;
}

export async function apiGet<T>(path: string): Promise<T> {
  const request = async () => {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as T;
  };

  try {
    return await request();
  } catch (e: unknown) {
    if (shouldRetryWarmup(e)) {
      await warmupBackend();
      return await request();
    }
    throw e;
  }
}

type JsonMethod = "GET" | "HEAD" | "POST" | "PATCH" | "PUT" | "DELETE";

// Overloads so you can call:
//   apiJson<T>("/path")                -> GET
//   apiJson<T>("/path", "POST", body)  -> non-GET
export async function apiJson<T>(path: string): Promise<T>;
export async function apiJson<T>(
  path: string,
  method: Exclude<JsonMethod, "GET">,
  body?: unknown
): Promise<T>;
export async function apiJson<T>(
  path: string,
  method?: JsonMethod,
  body?: unknown
): Promise<T> {
  const m: JsonMethod = method ?? "GET";
  const request = async () => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: m,
      headers: { "Content-Type": "application/json" },
      body:
        m === "GET" || m === "HEAD"
          ? undefined
          : body !== undefined
            ? JSON.stringify(body)
            : undefined,
    } as RequestInit);
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as T;
  };

  try {
    return await request();
  } catch (e: unknown) {
    if (shouldRetryWarmup(e)) {
      await warmupBackend();
      return await request();
    }
    throw e;
  }
}
