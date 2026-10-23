-- The portal_listing schema has changed since this seed was written: `id` is
-- now SERIAL (so a URL cannot be inserted into it positionally) and the portal
-- URL lives in `external_id`, which portal-operations.js publishes as the
-- portal's '@id'. Columns are named explicitly so the seed cannot silently
-- shift again.
--
-- `description` carries the UNIQUE constraint, so re-running the seed would
-- otherwise fail. Guard on it rather than relying on ON CONFLICT.
INSERT INTO portal_listing (external_id, description, title, terms_and_conditions)
SELECT
  'https://waterlooregionfood.ca/portal/profile',
  'A super duper portal for the waterloo region',
  'Waterloo Region Food Portal',
  'https://waterlooregionfood.ca/terms-and-conditions'
WHERE NOT EXISTS (
  SELECT 1 FROM portal_listing
  WHERE external_id = 'https://waterlooregionfood.ca/portal/profile'
);
