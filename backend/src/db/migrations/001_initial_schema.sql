-- Users of the tool. FUDO users are not involved: this is our own login.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'counter')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Only a SHA-256 of the session token is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- A physical (blind) stock count. Results are computed when it is saved
-- and stored as they were, so history does not move if FUDO data changes.
CREATE TABLE IF NOT EXISTS counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES users(id),
  counted_at TIMESTAMPTZ NOT NULL,
  note VARCHAR(500),
  products INTEGER NOT NULL,
  with_difference INTEGER NOT NULL,
  missing_units NUMERIC(14, 3) NOT NULL,
  missing_value NUMERIC(14, 2) NOT NULL,
  surplus_units NUMERIC(14, 3) NOT NULL,
  surplus_value NUMERIC(14, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_counts_counted_at ON counts(counted_at DESC);

CREATE TABLE IF NOT EXISTS count_lines (
  id BIGSERIAL PRIMARY KEY,
  count_id UUID NOT NULL REFERENCES counts(id) ON DELETE CASCADE,
  product_id VARCHAR(20) NOT NULL, -- FUDO product id
  product_name VARCHAR(255) NOT NULL,
  counted_at TIMESTAMPTZ NOT NULL, -- copy of counts.counted_at for lookups
  counted NUMERIC(14, 3) NOT NULL,
  system_stock NUMERIC(14, 3) NOT NULL,
  cost NUMERIC(14, 2),
  basis VARCHAR(20) NOT NULL CHECK (basis IN ('previous_count', 'system')),
  previous_counted NUMERIC(14, 3),
  previous_counted_at TIMESTAMPTZ,
  bought NUMERIC(14, 3) NOT NULL,
  sold NUMERIC(14, 3) NOT NULL,
  expected NUMERIC(14, 3) NOT NULL,
  difference NUMERIC(14, 3) NOT NULL,
  difference_value NUMERIC(14, 2),
  UNIQUE (count_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_count_lines_product
  ON count_lines(product_id, counted_at DESC);
