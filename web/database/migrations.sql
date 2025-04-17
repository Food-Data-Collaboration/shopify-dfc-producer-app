BEGIN;
CREATE TABLE IF NOT EXISTS "line_items" (
    "external_id" SERIAL PRIMARY KEY,
    "shopify_id" bigint NOT NULL,
    "variant_id" bigint NOT NULL,
    "order_id" bigint NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT order_id_variant_id UNIQUE (order_id, variant_id)
);
CREATE TRIGGER set_timestamp BEFORE
UPDATE ON "line_items" FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
COMMIT;

BEGIN;
CREATE TABLE IF NOT EXISTS "orders" (
    "draft_order_id" bigint PRIMARY KEY,
    "completed_order_id" bigint NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_timestamp BEFORE
UPDATE ON "orders" FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
COMMIT;

BEGIN;
CREATE TABLE IF NOT EXISTS "sales_sessions" (
    "id" SERIAL PRIMARY KEY,
    "shopify_order_id" bigint UNIQUE NOT NULL,
    "reservation_date" TEXT NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_timestamp BEFORE
UPDATE ON "sales_sessions" FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
COMMIT;


ALTER TABLE fdc_variants
    ALTER COLUMN wholesale_variant_id DROP NOT NULL,
    ALTER COLUMN no_of_items_per_package DROP NOT NULL,
    ADD COLUMN "enabled" boolean NOT NULL DEFAULT false;


create unique index idx_product_variant on fdc_variants (product_id, retail_variant_id);