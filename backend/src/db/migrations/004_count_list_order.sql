-- Walking order inside the shop (gondola by gondola).
ALTER TABLE count_list_products
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
