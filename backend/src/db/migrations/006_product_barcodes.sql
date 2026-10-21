-- Unit identifiers belong to this application, never written to FUDO.
CREATE TABLE IF NOT EXISTS product_barcodes (
  barcode TEXT PRIMARY KEY CHECK (barcode ~ '^([0-9]{8}|[0-9]{13})$'),
  product_id TEXT NOT NULL CHECK (product_id ~ '^[0-9]{1,10}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_barcodes_product_idx ON product_barcodes (product_id);
