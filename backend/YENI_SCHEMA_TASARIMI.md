# Yeni Veritabanı Şeması Tasarımı

## Mevcut Sistem (Coin Bazında)
```
coins
├── ca (PK)
├── name
└── ...

trades
├── id (PK)
├── ca (FK → coins)
├── entry_mcap_usd
└── ...

tips
├── tip_id (PK)
├── ca (FK → coins)
├── post_mcap_usd
└── ...

bubbles_clusters
├── ca (FK → coins)  ← COIN BAZINDA
├── cluster_rank
└── pct

bubbles_others
├── ca (FK → coins)  ← COIN BAZINDA
├── other_rank
└── pct

scoring
├── id (PK)
├── ca (FK → coins)  ← COIN BAZINDA
├── intuition_score
└── scored_ts
```

**Problem:** Aynı coin için birden fazla trade/tip açılsa, hepsi aynı bubbles/scoring'i paylaşıyor.

---

## Yeni Sistem (Trade/Tip Bazında)

### Tablo Yapısı

#### 1. `trades` (Değiştirilmiş)
```sql
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
```

#### 2. `trade_bubbles` (YENİ)
```sql
CREATE TABLE trade_bubbles (
    id SERIAL PRIMARY KEY,
    trade_id TEXT NOT NULL REFERENCES trades(trade_id) ON DELETE CASCADE,
    cluster_rank INT NOT NULL,
    pct FLOAT NOT NULL,
    created_ts TIMESTAMPTZ DEFAULT NOW()
);
```

#### 3. `trade_bubbles_others` (YENİ)
```sql
CREATE TABLE trade_bubbles_others (
    id SERIAL PRIMARY KEY,
    trade_id TEXT NOT NULL REFERENCES trades(trade_id) ON DELETE CASCADE,
    other_rank INT NOT NULL,
    pct FLOAT NOT NULL,
    created_ts TIMESTAMPTZ DEFAULT NOW()
);
```

#### 4. `trade_scoring` (YENİ)
```sql
CREATE TABLE trade_scoring (
    id SERIAL PRIMARY KEY,
    trade_id TEXT NOT NULL REFERENCES trades(trade_id) ON DELETE CASCADE,
    intuition_score INT NOT NULL CHECK (intuition_score >= 1 AND intuition_score <= 10),
    scored_ts TIMESTAMPTZ DEFAULT NOW()
);
```

#### 5. `tips` (Değiştirilmiş)
```sql
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
```

#### 6. `tip_bubbles` (YENİ)
```sql
CREATE TABLE tip_bubbles (
    id SERIAL PRIMARY KEY,
    tip_id INT NOT NULL REFERENCES tips(tip_id) ON DELETE CASCADE,
    cluster_rank INT NOT NULL,
    pct FLOAT NOT NULL,
    created_ts TIMESTAMPTZ DEFAULT NOW()
);
```

#### 7. `tip_bubbles_others` (YENİ)
```sql
CREATE TABLE tip_bubbles_others (
    id SERIAL PRIMARY KEY,
    tip_id INT NOT NULL REFERENCES tips(tip_id) ON DELETE CASCADE,
    other_rank INT NOT NULL,
    pct FLOAT NOT NULL,
    created_ts TIMESTAMPTZ DEFAULT NOW()
);
```

#### 8. `tip_scoring` (YENİ)
```sql
CREATE TABLE tip_scoring (
    id SERIAL PRIMARY KEY,
    tip_id INT NOT NULL REFERENCES tips(tip_id) ON DELETE CASCADE,
    intuition_score INT NOT NULL CHECK (intuition_score >= 1 AND intuition_score <= 10),
    scored_ts TIMESTAMPTZ DEFAULT NOW()
);
```

#### 9. `bubbles_clusters` (ESKİ - Silinecek)
```sql
-- Deprecated: Artık trade/tip bazında kaydediliyor
DROP TABLE bubbles_clusters;
```

#### 10. `bubbles_others` (ESKİ - Silinecek)
```sql
-- Deprecated: Artık trade/tip bazında kaydediliyor
DROP TABLE bubbles_others;
```

#### 11. `scoring` (ESKİ - Silinecek)
```sql
-- Deprecated: Artık trade/tip bazında kaydediliyor
DROP TABLE scoring;
```

---

## Yeni Sistem Diyagramı

```
coins
├── ca (PK)
├── name
└── ...

trades
├── id (PK)
├── trade_id (UNIQUE)
├── ca (FK → coins)
├── entry_mcap_usd
└── ...
    ├── trade_bubbles (FK → trades.trade_id) ← TRADE BAZINDA
    ├── trade_bubbles_others (FK → trades.trade_id) ← TRADE BAZINDA
    └── trade_scoring (FK → trades.trade_id) ← TRADE BAZINDA

tips
├── tip_id (PK)
├── ca (FK → coins)
├── post_mcap_usd
└── ...
    ├── tip_bubbles (FK → tips.tip_id) ← TIP BAZINDA
    ├── tip_bubbles_others (FK → tips.tip_id) ← TIP BAZINDA
    └── tip_scoring (FK → tips.tip_id) ← TIP BAZINDA
```

---

## Avantajlar

✅ **Veri Bağımsızlığı:** Her trade/tip'in kendi özel bubbles/scoring verileri
✅ **Cascade Silme:** Trade silinince tüm ilişkili veriler otomatik silinir
✅ **Esneklik:** Aynı coin için farklı trade/tip'ler farklı bubbles/scoring'e sahip olabilir
✅ **Veri Tutarlılığı:** Silinmiş trade/tip'in hiçbir izleri kalmaz
✅ **Performans:** Foreign Key constraints ile referential integrity sağlanır

---

## Migration Stratejisi

### Adım 1: Yeni Tabloları Oluştur
```sql
CREATE TABLE trade_bubbles (...);
CREATE TABLE trade_bubbles_others (...);
CREATE TABLE trade_scoring (...);
CREATE TABLE tip_bubbles (...);
CREATE TABLE tip_bubbles_others (...);
CREATE TABLE tip_scoring (...);
```

### Adım 2: Eski Verileri Migrate Et (İsteğe Bağlı)
```sql
-- Eğer eski bubbles/scoring verilerini korumak istiyorsanız:
INSERT INTO trade_bubbles (trade_id, cluster_rank, pct)
SELECT t.trade_id, bc.cluster_rank, bc.pct
FROM trades t
JOIN bubbles_clusters bc ON t.ca = bc.ca;

-- Benzer şekilde diğer tablolar için...
```

### Adım 3: Eski Tabloları Sil
```sql
DROP TABLE bubbles_clusters;
DROP TABLE bubbles_others;
DROP TABLE scoring;
```

---

## API Değişiklikleri

### Trade Açarken (POST /trades/open)
**Eski:**
```json
{
  "ca": "0x...",
  "entry_mcap_usd": 1000000,
  "size_usd": 100000
}
```

**Yeni:**
```json
{
  "ca": "0x...",
  "entry_mcap_usd": 1000000,
  "size_usd": 100000,
  "bubbles": {
    "clusters": [{"rank": 1, "pct": 0.5}, ...],
    "others": [{"rank": 1, "pct": 0.3}, ...]
  },
  "scoring": {
    "intuition_score": 85
  }
}
```

### Tip Açarken (POST /tips)
**Eski:**
```json
{
  "ca": "0x...",
  "account_id": 1,
  "post_ts": "2024-01-01T00:00:00Z",
  "post_mcap_usd": 500000
}
```

**Yeni:**
```json
{
  "ca": "0x...",
  "account_id": 1,
  "post_ts": "2024-01-01T00:00:00Z",
  "post_mcap_usd": 500000,
  "bubbles": {
    "clusters": [{"rank": 1, "pct": 0.5}, ...],
    "others": [{"rank": 1, "pct": 0.3}, ...]
  },
  "scoring": {
    "intuition_score": 90
  }
}
```

---

## Silme İşlemi (Cascade)

### Trade Silindiğinde
```
DELETE /trades/{trade_id}
├── trade_bubbles silinir (FK ON DELETE CASCADE)
├── trade_bubbles_others silinir (FK ON DELETE CASCADE)
├── trade_scoring silinir (FK ON DELETE CASCADE)
└── trades silinir
```

### Tip Silindiğinde
```
DELETE /tips/{tip_id}
├── tip_bubbles silinir (FK ON DELETE CASCADE)
├── tip_bubbles_others silinir (FK ON DELETE CASCADE)
├── tip_scoring silinir (FK ON DELETE CASCADE)
└── tips silinir
```

### Coin Silindiğinde
```
DELETE /coins/{ca}
├── tips silinir (FK ON DELETE CASCADE)
│   ├── tip_bubbles silinir (FK ON DELETE CASCADE)
│   ├── tip_bubbles_others silinir (FK ON DELETE CASCADE)
│   └── tip_scoring silinir (FK ON DELETE CASCADE)
├── trades silinir (FK ON DELETE CASCADE)
│   ├── trade_bubbles silinir (FK ON DELETE CASCADE)
│   ├── trade_bubbles_others silinir (FK ON DELETE CASCADE)
│   └── trade_scoring silinir (FK ON DELETE CASCADE)
└── coins silinir
```

---

## Sonraki Adımlar

1. Migration SQL dosyası oluştur
2. Backend schemas güncelle (TradeOpen, TipCreate vb.)
3. Backend routes güncelle (trades, tips, bubbles, scoring)
4. Frontend forms güncelle (bubbles/scoring input'ları ekle)
5. Frontend display güncelle (trade/tip detayında bubbles/scoring göster)
6. Silme işlemini test et
