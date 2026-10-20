-- Saved selections of products to count together (e.g. "Diario - alto riesgo").
CREATE TABLE IF NOT EXISTS count_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_count_lists_name
  ON count_lists (lower(name));

CREATE TABLE IF NOT EXISTS count_list_products (
  list_id UUID NOT NULL REFERENCES count_lists(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL CHECK (product_id ~ '^[0-9]{1,10}$'), -- FUDO id
  PRIMARY KEY (list_id, product_id)
);

-- The list a count was made with. The name is copied so history keeps
-- reading the same after a rename or a delete.
ALTER TABLE counts
  ADD COLUMN IF NOT EXISTS list_id UUID
    REFERENCES count_lists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS list_name TEXT;

CREATE INDEX IF NOT EXISTS idx_counts_list ON counts(list_id);
