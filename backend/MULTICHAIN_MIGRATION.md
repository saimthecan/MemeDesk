# Multichain Migration Plan

Goal: allow the same CA on multiple chains by using (chain, ca) as identity.

Scope: coins, trades, tips, and views. Legacy coin-level bubbles/scoring
should be deprecated or updated to include chain.

Steps
1) Add chain columns to trades and tips, then backfill from coins.
2) Update v_trades_pnl and v_tip_gain_loss to join on (chain, ca).
3) Update app inserts to include chain for trades/tips.
4) Add composite FKs on (chain, ca) to trades/tips.
5) If duplicate CA across chains is required, drop coins PK on ca and
   add a composite PK on (chain, ca).
6) Update context to store active_chain or active_coin_id.
7) Audit legacy tables (bubbles_clusters, bubbles_others, scoring) and
   either add chain or remove in favor of trade/tip level tables.
