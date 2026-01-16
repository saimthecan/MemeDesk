import { NextResponse } from "next/server";

export const maxDuration = 60;

const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 18000;
const RETRY_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST() {
  const base = process.env.NEXT_PUBLIC_API_URL;
  const key = process.env.WARMUP_KEY;

  if (!base) {
    return NextResponse.json(
      { ok: false, error: "missing NEXT_PUBLIC_API_URL" },
      { status: 500 }
    );
  }

  const url = `${base.replace(/\/+$/, "")}/warmup`;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          ...(key ? { "x-warmup-key": key } : {}),
        },
        cache: "no-store",
        signal: controller.signal,
      });

      const text = await res.text();
      if (res.ok || res.status < 500) {
        return new NextResponse(text, {
          status: res.status,
          headers: {
            "content-type":
              res.headers.get("content-type") ?? "application/json",
          },
        });
      }
      lastError = text || `HTTP ${res.status}`;
    } catch (e: unknown) {
      lastError =
        e instanceof Error && e.name === "AbortError"
          ? "timeout"
          : String(e);
    } finally {
      clearTimeout(t);
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS);
    }
  }

  return NextResponse.json(
    { ok: false, error: lastError ?? "unknown" },
    { status: 502 }
  );
}
