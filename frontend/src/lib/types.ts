export type TokenMeta = {
  name: string | null;
  symbol: string | null;
  launch_ts: string | null;
  pairs_found: number;
  chain: string | null; // <-- EKLENDİ
};

export type CoinSummary = {
  ca: string;
  name: string;
  symbol: string | null;
  launch_ts: string | null;
  chain: string | null; // <-- EKLENDİ
  source_type: "dex" | "influencer" | "both";
  created_ts: string | null;
  trades_total: number;
  trades_open: number;
  tips_total: number;
  last_activity_ts: string | null;
};

export type Trade = {
  id: number;
  trade_id: string;
  ca: string;
  coin_name: string;
  entry_ts: string | null;
  entry_mcap_usd: number | null;
  size_usd: number | null;
  exit_ts: string | null;
  exit_mcap_usd: number | null;
  exit_reason: string | null;
  pnl_pct: number | null;
  pnl_usd: number | null;
};

export type Tip = {
  tip_id: number;
  ca: string;
  coin_name: string;
  account_id: number;
  platform: string;
  handle: string;
  post_ts: string | null;
  post_mcap_usd: number;
  peak_mcap_usd: number | null;
  trough_mcap_usd: number | null;
  rug_flag: number | null;
  gain_pct: number | null;
  drop_pct: number | null;
  effect_pct: number | null;
};

export type BubbleRow = { rank: number; pct: number };

export type AccountSummary = {
  account_id: number;
  platform: string;
  handle: string;
  tips_total: number;
  win_rate_50p: number | null;
  rug_rate: number | null;
  avg_effect_pct: number | null;
};

export type CoinDetail = {
  coin: CoinSummary;
  trades: Trade[];
  tips: Tip[];
  bubbles: { clusters: BubbleRow[]; others: BubbleRow[] };
  scoring: { intuition_score: number; scored_ts: string; id?: number }[];
  accounts_summary: AccountSummary[];
};