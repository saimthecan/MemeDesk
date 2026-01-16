import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import routes_dexscreener as dex


class TestDexscreenerCache(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        dex._cache.clear()

    async def test_cache_set_get(self):
        with patch("routes_dexscreener.monotonic", return_value=100.0):
            await dex._cache_set_async("token", {"value": 1})
        with patch("routes_dexscreener.monotonic", return_value=100.0):
            cached = await dex._cache_get_async("token")
        self.assertEqual(cached, {"value": 1})

    async def test_cache_expired(self):
        with patch("routes_dexscreener.monotonic", return_value=100.0):
            await dex._cache_set_async("token", {"value": 1})
        with patch(
            "routes_dexscreener.monotonic",
            return_value=100.0 + dex.CACHE_TTL_SEC + 1,
        ):
            cached = await dex._cache_get_async("token")
        self.assertIsNone(cached)

    def test_ms_to_dt_utc(self):
        dt = dex._ms_to_dt_utc(0)
        self.assertEqual(dt.isoformat(), "1970-01-01T00:00:00+00:00")
