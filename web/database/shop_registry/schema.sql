CREATE TABLE IF NOT EXISTS shops (
  id SERIAL PRIMARY KEY,
  shop_name VARCHAR(255) NOT NULL UNIQUE,
  variant_mappings_enabled BOOLEAN DEFAULT NULL,
  installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  setup_completed BOOLEAN DEFAULT FALSE,
  orders_feature_enabled BOOLEAN DEFAULT FALSE,
  db_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_trigger 
    WHERE tgname = 'set_shops_updated_at'
  ) THEN
    CREATE TRIGGER set_shops_updated_at
    BEFORE UPDATE ON shops
    FOR EACH ROW
    EXECUTE PROCEDURE trigger_set_timestamp();
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_shops_shop_name ON shops(shop_name);
CREATE INDEX IF NOT EXISTS idx_shops_setup ON shops(setup_completed);

COMMENT ON TABLE shops IS 'Central registry of all shops in the system';
COMMENT ON COLUMN shops.shop_name IS 'Unique name of the shop';
COMMENT ON COLUMN shops.variant_mappings_enabled IS 'Whether variant mappings are enabled for this shop';
COMMENT ON COLUMN shops.installed_at IS 'Timestamp when the app was installed';
COMMENT ON COLUMN shops.setup_completed IS 'Whether initial setup has been completed';
COMMENT ON COLUMN shops.orders_feature_enabled IS 'Feature flag for enabling orders functionality';
COMMENT ON COLUMN shops.db_name IS 'Name of the database for this shop';
