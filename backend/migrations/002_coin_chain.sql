-- 002 - multichain support: add chain column + safe uniqueness

BEGIN;

-- 1) coins: chain column
ALTER TABLE coins
  ADD COLUMN IF NOT EXISTS chain TEXT;

-- mevcut kayıtları varsayılan chain ile doldur (şu ana kadar Solana idi)
UPDATE coins
SET chain = 'solana'
WHERE chain IS NULL OR chain = '';

-- chain artık zorunlu olsun (boş kalmasın)
ALTER TABLE coins
  ALTER COLUMN chain SET NOT NULL;

-- 2) aynı contract farklı chain'de olabileceği için (chain, ca) unique
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_coins_chain_ca'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_coins_chain_ca ON coins (chain, ca);';
  END IF;
END $$;

COMMIT;