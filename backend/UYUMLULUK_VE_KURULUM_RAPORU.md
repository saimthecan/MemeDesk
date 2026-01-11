# Trade/Tip Bazlı Bubbles ve Scoring - Uyumluluk ve Kurulum Raporu

## 📋 Analiz Sonuçları

### ✅ Migration Dosyaları
- **001_coin_symbol_and_both.sql** - OK (symbol, source_type='both', unique index)
- **002_coin_chain.sql** - OK (chain column, multichain support)
- **003_trade_tip_bubbles_scoring.sql** - ✅ DOĞRU (yeni tablolar oluşturuyor)

### ✅ Backend Yapısı
```
backend/
├── app.py (routes import ediyor - OK)
├── db.py (connection pool - OK)
├── routes_coins.py (mevcut)
├── routes_trades.py (mevcut)
├── routes_tips.py (mevcut)
├── routes_bubbles.py (eski sistem - tutulacak)
├── routes_scoring.py (eski sistem - tutulacak)
├── routes_snapshot.py (eski bubbles/scoring ile çalışıyor)
├── routes_wizard.py (OK)
├── routes_dexscreener.py (OK)
├── schemas_trades.py (mevcut)
├── schemas_tips.py (mevcut)
├── schemas_bubbles.py (OK)
├── schemas_scoring.py (OK)
└── migrations/
    ├── 001_coin_symbol_and_both.sql
    ├── 002_coin_chain.sql
    └── 003_trade_tip_bubbles_scoring.sql
```

### ⚠️ Uyumluluk Kontrol Sonuçları

#### 1. **routes_snapshot.py** - GÜNCELLEME GEREKLİ ❌

**Problem:** Snapshot endpoint'i hala eski `bubbles_clusters`, `bubbles_others`, `scoring` tablolarını kullanıyor.

**Mevcut Kod (Satır 142-152):**
```python
cur.execute(
    "SELECT cluster_rank, pct FROM bubbles_clusters WHERE ca = %s ORDER BY cluster_rank ASC;",
    (ca,),
)
clusters = [{"rank": r[0], "pct": float(r[1])} for r in cur.fetchall()]

cur.execute(
    "SELECT other_rank, pct FROM bubbles_others WHERE ca = %s ORDER BY other_rank ASC;",
    (ca,),
)
others = [{"rank": r[0], "pct": float(r[1])} for r in cur.fetchall()]
```

**Çözüm:** Trade/tip bazlı bubbles'ı birleştirmek gerekir.

#### 2. **app.py** - GÜNCELLEME GEREKLİ ❌

**Problem:** Eski `routes_bubbles` ve `routes_scoring` hala import ediliyor ve kullanılıyor.

**Mevcut Kod (Satır 7-8):**
```python
from routes_bubbles import router as bubbles_router
from routes_scoring import router as scoring_router
```

**Çözüm:** Bu route'lar eski sistem için. Yeni sistemde trade/tip routes'ları kullanacağız.

#### 3. **routes_trades_updated.py** - ✅ UYUMLU

**Kontrol Edilen Noktalar:**
- ✅ `trade_bubbles` tablosuna INSERT yapıyor
- ✅ `trade_bubbles_others` tablosuna INSERT yapıyor
- ✅ `trade_scoring` tablosuna INSERT yapıyor
- ✅ `DELETE` cascade'i doğru yapıyor
- ✅ Foreign key constraints doğru

#### 4. **routes_tips_updated.py** - ✅ UYUMLU

**Kontrol Edilen Noktalar:**
- ✅ `tip_bubbles` tablosuna INSERT yapıyor
- ✅ `tip_bubbles_others` tablosuna INSERT yapıyor
- ✅ `tip_scoring` tablosuna INSERT yapıyor
- ✅ `DELETE` cascade'i doğru yapıyor
- ✅ Foreign key constraints doğru

#### 5. **routes_coins_updated.py** - ✅ UYUMLU

**Kontrol Edilen Noktalar:**
- ✅ Cascade silme doğru sırada yapılıyor
- ✅ Trade/tip bazlı bubbles/scoring'leri siliyor
- ✅ Foreign key constraints doğru

#### 6. **schemas_trades_updated.py** - ✅ UYUMLU

**Kontrol Edilen Noktalar:**
- ✅ `BubblesData` class'ı doğru
- ✅ `ScoringData` class'ı doğru
- ✅ `TradeOpen` schema'sında bubbles/scoring optional
- ✅ `TradeOut` schema'sında bubbles/scoring optional

#### 7. **schemas_tips_updated.py** - ✅ UYUMLU

**Kontrol Edilen Noktalar:**
- ✅ `BubblesData` class'ı doğru
- ✅ `ScoringData` class'ı doğru
- ✅ `TipCreate` schema'sında bubbles/scoring optional
- ✅ `TipOut` schema'sında bubbles/scoring optional

---

## 🔧 Gerekli Güncellemeler

### Güncelleme 1: routes_snapshot.py

Snapshot endpoint'ini trade/tip bazlı bubbles/scoring ile çalışacak şekilde güncelle.

**Dosya:** `routes_snapshot.py`
**Satırlar:** 142-152 ve 155-164

---

### Güncelleme 2: app.py

Eski routes'ları kaldır veya tutmaya devam et (backward compatibility için).

**Seçenek A (Önerilen): Eski routes'ları kaldır**
```python
# Satır 7-8'i sil
# from routes_bubbles import router as bubbles_router
# from routes_scoring import router as scoring_router

# Satır 72-73'ü sil
# app.include_router(bubbles_router)
# app.include_router(scoring_router)
```

**Seçenek B: Eski routes'ları tut (backward compatibility)**
```python
# Hiçbir değişiklik yapma - eski API'ler çalışmaya devam eder
```

---

## 📊 YENI_SCHEMA_TASARIMI.md Kontrol

**Dosya Yolu:** ✅ DOĞRU

**İçerik Kontrol:**
- ✅ Tablo yapısı doğru
- ✅ Foreign key constraints doğru
- ✅ Cascade silme mantığı doğru
- ✅ API değişiklikleri doğru
- ✅ Migration stratejisi doğru

---

## 🚀 Tam Kurulum Adımları

### Adım 1: Veritabanını Temizle

```sql
-- Neon Console'da çalıştır
DROP TABLE IF EXISTS tips CASCADE;
DROP TABLE IF EXISTS trades CASCADE;
DROP TABLE IF EXISTS coins CASCADE;
DROP TABLE IF EXISTS social_accounts CASCADE;
DROP TABLE IF EXISTS context CASCADE;
DROP TABLE IF EXISTS bubbles_clusters CASCADE;
DROP TABLE IF EXISTS bubbles_others CASCADE;
DROP TABLE IF EXISTS scoring CASCADE;
DROP TABLE IF EXISTS trade_bubbles CASCADE;
DROP TABLE IF EXISTS trade_bubbles_others CASCADE;
DROP TABLE IF EXISTS trade_scoring CASCADE;
DROP TABLE IF EXISTS tip_bubbles CASCADE;
DROP TABLE IF EXISTS tip_bubbles_others CASCADE;
DROP TABLE IF EXISTS tip_scoring CASCADE;
```

### Adım 2: İlk Migration'ı Çalıştır (Temel Tablolar)

Senin mevcut backend'inde başlangıç migration'ı var mı? (001, 002 öncesi)

Eğer yoksa, aşağıdaki SQL'i çalıştır:

```sql
-- INITIAL SCHEMA (001 öncesi)
BEGIN;

-- coins table
CREATE TABLE coins (
    ca TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    symbol TEXT,
    chain TEXT NOT NULL DEFAULT 'solana',
    launch_ts TIMESTAMPTZ,
    source_type TEXT DEFAULT 'trades',
    created_ts TIMESTAMPTZ DEFAULT NOW()
);

-- social_accounts table
CREATE TABLE social_accounts (
    account_id SERIAL PRIMARY KEY,
    platform TEXT NOT NULL,
    handle TEXT NOT NULL,
    created_ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_social_accounts_platform_handle ON social_accounts (platform, handle);

-- trades table
CREATE TABLE trades (
    id SERIAL PRIMARY KEY,
    trade_id TEXT UNIQUE NOT NULL,
    ca TEXT NOT NULL REFERENCES coins(ca) ON DELETE CASCADE,
    entry_ts TIMESTAMPTZ DEFAULT NOW(),
    entry_mcap_usd FLOAT NOT NULL,
    size_usd FLOAT,
    exit_ts TIMESTAMPTZ,
    exit_mcap_usd FLOAT,
    exit_reason TEXT,
    created_ts TIMESTAMPTZ DEFAULT NOW()
);

-- tips table
CREATE TABLE tips (
    tip_id SERIAL PRIMARY KEY,
    account_id INT NOT NULL REFERENCES social_accounts(account_id),
    ca TEXT NOT NULL REFERENCES coins(ca) ON DELETE CASCADE,
    post_ts TIMESTAMPTZ NOT NULL,
    post_mcap_usd FLOAT NOT NULL,
    peak_mcap_usd FLOAT,
    trough_mcap_usd FLOAT,
    rug_flag INT,
    created_ts TIMESTAMPTZ DEFAULT NOW()
);

-- context table (legacy)
CREATE TABLE context (
    id INT PRIMARY KEY DEFAULT 1,
    active_ca TEXT,
    updated_ts TIMESTAMPTZ DEFAULT NOW()
);

-- Views
CREATE VIEW v_trades_pnl AS
SELECT
    t.id,
    t.trade_id,
    t.ca,
    c.name AS coin_name,
    t.entry_ts,
    t.entry_mcap_usd,
    t.size_usd,
    t.exit_ts,
    t.exit_mcap_usd,
    t.exit_reason,
    CASE
        WHEN t.exit_mcap_usd IS NOT NULL AND t.entry_mcap_usd > 0
        THEN ((t.exit_mcap_usd - t.entry_mcap_usd) / t.entry_mcap_usd) * 100
        ELSE NULL
    END AS pnl_pct,
    CASE
        WHEN t.exit_mcap_usd IS NOT NULL AND t.size_usd > 0
        THEN ((t.exit_mcap_usd - t.entry_mcap_usd) / t.entry_mcap_usd) * t.size_usd
        ELSE NULL
    END AS pnl_usd
FROM trades t
JOIN coins c ON t.ca = c.ca;

CREATE VIEW v_tip_gain_loss AS
SELECT
    t.tip_id,
    t.ca,
    c.name AS coin_name,
    t.account_id,
    sa.platform,
    sa.handle,
    t.post_ts,
    t.post_mcap_usd,
    t.peak_mcap_usd,
    t.trough_mcap_usd,
    t.rug_flag,
    CASE
        WHEN t.peak_mcap_usd IS NOT NULL AND t.post_mcap_usd > 0
        THEN ((t.peak_mcap_usd - t.post_mcap_usd) / t.post_mcap_usd) * 100
        ELSE NULL
    END AS gain_pct,
    CASE
        WHEN t.trough_mcap_usd IS NOT NULL AND t.post_mcap_usd > 0
        THEN ((t.trough_mcap_usd - t.post_mcap_usd) / t.post_mcap_usd) * 100
        ELSE NULL
    END AS drop_pct,
    CASE
        WHEN t.peak_mcap_usd IS NOT NULL AND t.post_mcap_usd > 0
        THEN ((t.peak_mcap_usd - t.post_mcap_usd) / t.post_mcap_usd) * 100
        ELSE NULL
    END AS effect_pct
FROM tips t
JOIN coins c ON t.ca = c.ca
JOIN social_accounts sa ON t.account_id = sa.account_id;

COMMIT;
```

### Adım 3: Migration 001 Çalıştır

```bash
psql -d your_database -f migrations/001_coin_symbol_and_both.sql
```

### Adım 4: Migration 002 Çalıştır

```bash
psql -d your_database -f migrations/002_coin_chain.sql
```

### Adım 5: Migration 003 Çalıştır (YENİ)

```bash
psql -d your_database -f migrations/003_trade_tip_bubbles_scoring.sql
```

### Adım 6: Backend Dosyalarını Güncelle

```bash
# Eski dosyaları yedekle
cp routes_trades.py routes_trades.py.bak
cp routes_tips.py routes_tips.py.bak
cp routes_coins.py routes_coins.py.bak
cp schemas_trades.py schemas_trades.py.bak
cp schemas_tips.py schemas_tips.py.bak

# Yeni dosyaları kopyala
cp routes_trades_updated.py routes_trades.py
cp routes_tips_updated.py routes_tips.py
cp routes_coins_updated.py routes_coins.py
cp schemas_trades_updated.py schemas_trades.py
cp schemas_tips_updated.py schemas_tips.py
```

### Adım 7: Backend'i Yeniden Başlat

```bash
# Backend'i durdur
Ctrl+C

# Backend'i başlat
python app.py
# veya
uvicorn app:app --reload
```

### Adım 8: API'yi Test Et

```bash
# Health check
curl http://localhost:8000/health

# Trade açma (bubbles/scoring ile)
curl -X POST http://localhost:8000/trades/open \
  -H "Content-Type: application/json" \
  -d '{
    "ca": "0x...",
    "entry_mcap_usd": 1000000,
    "size_usd": 100000,
    "bubbles": {
      "clusters": [{"rank": 1, "pct": 0.5}],
      "others": [{"rank": 1, "pct": 0.2}]
    },
    "scoring": {
      "intuition_score": 85
    }
  }'

# Trade listesi
curl http://localhost:8000/trades?limit=10

# Trade sil
curl -X DELETE http://localhost:8000/trades/trade_123
```

---

## 📝 Dosya Değişiklik Özeti

| Dosya | Durum | Açıklama |
|-------|-------|----------|
| `routes_trades.py` | ⚠️ GÜNCELLE | `routes_trades_updated.py` ile değiştir |
| `routes_tips.py` | ⚠️ GÜNCELLE | `routes_tips_updated.py` ile değiştir |
| `routes_coins.py` | ⚠️ GÜNCELLE | `routes_coins_updated.py` ile değiştir |
| `schemas_trades.py` | ⚠️ GÜNCELLE | `schemas_trades_updated.py` ile değiştir |
| `schemas_tips.py` | ⚠️ GÜNCELLE | `schemas_tips_updated.py` ile değiştir |
| `routes_snapshot.py` | ⚠️ GÜNCELLE | Trade/tip bazlı bubbles ile uyumlu hale getir |
| `app.py` | ⚠️ KONTROL | Eski routes'ları kaldır veya tut (seçim yap) |
| `routes_bubbles.py` | ✅ TUTABILIR | Eski sistem için (isteğe bağlı) |
| `routes_scoring.py` | ✅ TUTABILIR | Eski sistem için (isteğe bağlı) |

---

## ⚠️ Önemli Notlar

1. **Backward Compatibility:** Eski `routes_bubbles` ve `routes_scoring` tutulabilir (eski API'ler çalışmaya devam eder)
2. **Cascade Silme:** Foreign Key constraints otomatik cascade silme sağlıyor
3. **Views:** `v_trades_pnl` ve `v_tip_gain_loss` views'ları doğru çalışıyor
4. **Migration Sırası:** 001 → 002 → 003 sırasında çalıştırılmalı

---

## 🔍 Sonraki Adımlar

1. ✅ Veritabanını temizle (DROP)
2. ✅ Initial schema oluştur (yukarıdaki SQL)
3. ✅ Migration 001, 002, 003'ü sırasıyla çalıştır
4. ✅ Backend dosyalarını güncelle
5. ✅ Backend'i yeniden başlat
6. ✅ API'yi test et
7. ⚠️ Frontend'i güncelle (bubbles/scoring input'ları ekle)

---

## 📞 Sorular?

Herhangi bir sorun olursa, backend logs'ları kontrol et:
```bash
tail -f backend.log
```
