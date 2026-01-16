import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import ValidationError

from schemas_scoring import ScoreCreate
from schemas_tips import TipCreate, TipUpdate
from schemas_trades import TradeClose, TradeOpen


class TestSchemas(unittest.TestCase):
    def test_tip_update_rug_flag_valid(self):
        TipUpdate(rug_flag=0)
        TipUpdate(rug_flag=1)

    def test_tip_update_rug_flag_invalid(self):
        with self.assertRaises(ValidationError):
            TipUpdate(rug_flag=-1)
        with self.assertRaises(ValidationError):
            TipUpdate(rug_flag=2)

    def test_trade_close_trade_id_optional(self):
        TradeClose(exit_mcap_usd=1.0)
        TradeClose(exit_mcap_usd=1.0, trade_id=None)
        with self.assertRaises(ValidationError):
            TradeClose(exit_mcap_usd=1.0, trade_id="a")

    def test_trade_open_chain_optional(self):
        TradeOpen(ca="abc", entry_mcap_usd=1.0)
        TradeOpen(ca="abc", chain="solana", entry_mcap_usd=1.0)

    def test_tip_create_chain_optional(self):
        TipCreate(
            ca="abc",
            account_id=1,
            post_ts=datetime.now(timezone.utc),
            post_mcap_usd=1.0,
        )
        TipCreate(
            ca="abc",
            chain="solana",
            account_id=1,
            post_ts=datetime.now(timezone.utc),
            post_mcap_usd=1.0,
        )

    def test_score_create_chain_optional(self):
        ScoreCreate(ca="abc", intuition_score=5)
        ScoreCreate(ca="abc", chain="solana", intuition_score=5)
