import { dexChainIdFor } from "../utils/dex";

export async function fetchDexLogo(
  chain: string | null | undefined,
  tokenAddress: string
): Promise<string | null> {
  const chainId = dexChainIdFor(chain);
  if (!chainId) return null;

  const url = `https://api.dexscreener.com/tokens/v1/${chainId}/${tokenAddress}`;
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) return null;

  const arr = (await res.json()) as Array<{
    baseToken?: { address?: string };
    info?: { imageUrl?: string };
  }>;

  if (!Array.isArray(arr) || arr.length === 0) return null;

  const want = tokenAddress.toLowerCase();
  const picked =
    arr.find((p) => (p?.baseToken?.address || "").toLowerCase() === want) ??
    arr[0];

  const img = picked?.info?.imageUrl;
  if (typeof img === "string" && img.trim()) return img.trim();
  return null;
}
