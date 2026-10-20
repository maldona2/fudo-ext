-- Retain checks so the owner can audit attempts to probe stock figures.
CREATE TABLE IF NOT EXISTS count_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  list_id UUID REFERENCES count_lists(id) ON DELETE SET NULL,
  entries JSONB NOT NULL,
  recount_ids TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_count_checks_user ON count_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_count_checks_list ON count_checks(list_id);

ALTER TABLE count_lines
  ADD COLUMN IF NOT EXISTS first_counted NUMERIC(14, 3);
