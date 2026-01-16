export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const ADMIN_TOKEN_KEY = "admin_token";
const ADMIN_TOKEN_EXP_KEY = "admin_token_exp";

type AdminLoginResponse = {
  ok: boolean;
  token: string;
  expires_in: number;
};

function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const expRaw = localStorage.getItem(ADMIN_TOKEN_EXP_KEY);
  if (!token || !expRaw) return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || Date.now() > exp) {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_TOKEN_EXP_KEY);
    return null;
  }
  return token;
}

async function loginWithPrompt(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const password = window.prompt("Admin sifresi");
  if (!password) return null;
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
    credentials: "include",
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as AdminLoginResponse;
  const exp = Date.now() + data.expires_in * 1000;
  localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
  localStorage.setItem(ADMIN_TOKEN_EXP_KEY, String(exp));
  return data.token;
}

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
    const token = getAdminToken();
    const res = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
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
  const m = (method ?? "GET") as JsonMethod;
  const canHaveBody = m !== "GET" && m !== "HEAD";
  const bodyPayload =
    canHaveBody && body !== undefined ? JSON.stringify(body) : undefined;
  const request = async () => {
    const token = getAdminToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, {
      method: m,
      headers,
      credentials: "include",
      body: bodyPayload,
    } as RequestInit);
    if (!res.ok) {
      if (res.status === 401 && canHaveBody) {
        const newToken = await loginWithPrompt();
        if (newToken) {
          headers.Authorization = `Bearer ${newToken}`;
          const retry = await fetch(`${API_BASE}${path}`, {
            method: m,
            headers,
            credentials: "include",
            body: bodyPayload,
          } as RequestInit);
          if (!retry.ok) throw new Error(await retry.text());
          return (await retry.json()) as T;
        }
        throw new Error("Admin giris iptal edildi.");
      }
      throw new Error(await res.text());
    }
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
