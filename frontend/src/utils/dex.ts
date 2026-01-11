export function dexChainIdFor(chain: string | null | undefined): string | null {
  const c = (chain || "").toLowerCase();

  const map: Record<string, string> = {
    eth: "ethereum",
    ethereum: "ethereum",
    bsc: "bsc",
    sol: "solana",
    solana: "solana",
    base: "base",
    arb: "arbitrum",
    arbitrum: "arbitrum",
    polygon: "polygon",
    matic: "polygon",
    avax: "avalanche",
    avalanche: "avalanche",
    op: "optimism",
    optimism: "optimism",
    fantom: "fantom",
    ftm: "fantom",
    cronos: "cronos",
    linea: "linea",
    blast: "blast",
  };

  return map[c] ?? null;
}

export function dexUrlFor(chain: string | null | undefined, ca: string): string {
  const chainId = dexChainIdFor(chain);
  if (!chainId)
    return `https://dexscreener.com/search?q=${encodeURIComponent(ca)}`;
  return `https://dexscreener.com/${chainId}/${ca}`;
}
