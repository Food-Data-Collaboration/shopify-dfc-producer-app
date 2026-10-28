BEGIN;
-- Non-destructive on purpose: this script is re-run by developers against an
-- existing volume. Dropping portal_listing / portal_permissions here would
-- silently delete portal configurations and scope grants on every normal
-- rerun. Use CREATE TABLE IF NOT EXISTS and only re-create the trigger.
CREATE TABLE IF NOT EXISTS "portal_listing" (
    "id" serial PRIMARY KEY,
    "external_id" TEXT,
    "description" TEXT UNIQUE NOT NULL,
    "title" TEXT NOT NULL,
    "terms_and_conditions" TEXT NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS set_timestamp ON "portal_listing";
CREATE TRIGGER set_timestamp BEFORE
  UPDATE ON "portal_listing" FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE IF NOT EXISTS "portal_permissions" (
    "id" serial PRIMARY KEY,
    "producer" INTEGER NOT NULL,
    "portal" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_producer
      FOREIGN KEY(producer) 
        REFERENCES shops(id),
    CONSTRAINT fk_portal
      FOREIGN KEY(portal) 
        REFERENCES portal_listing(id)
);
DROP TRIGGER IF EXISTS set_timestamp ON "portal_permissions";
CREATE TRIGGER set_timestamp BEFORE
  UPDATE ON "portal_permissions" FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
COMMIT;
