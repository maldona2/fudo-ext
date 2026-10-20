-- Units per closed pack (cajón, fardo, cartón). Lives here, not in FUDO.
CREATE TABLE IF NOT EXISTS product_packs (
  product_id TEXT PRIMARY KEY CHECK (product_id ~ '^[0-9]{1,10}$'),
  units INTEGER NOT NULL CHECK (units BETWEEN 2 AND 1000),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 20),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
