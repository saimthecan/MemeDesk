import { NextResponse } from "next/server";

export async function POST() {
  const base = process.env.NEXT_PUBLIC_API_URL;
  const key = process.env.WARMUP_KEY;

  if (!base) {
    return NextResponse.json(
      { ok: false, error: "missing NEXT_PUBLIC_API_URL" },
      { status: 500 }
    );
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/warmup`, {
      method: "GET",
      headers: {
        ...(key ? { "x-warmup-key": key } : {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "content-type":
          res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error && e.name === "AbortError" ? "timeout" : String(e) },
      { status: 502 }
    );
  } finally {
    clearTimeout(t);
  }
}
