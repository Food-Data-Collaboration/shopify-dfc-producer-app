# Local postgres for the test suite

Runs postgres in Docker on `localhost:5435`. No root or sudo required — you
only need to be in the `docker` group.

## Setup

From the repo root:

```bash
./scripts/setup-test-db.sh
```

That starts postgres, creates the role and databases, applies every schema the
tests need, seeds the dev portal and the test users, and writes
`DATABASE_HOST_URL` / `SHOP_REGISTRY_DATABASE_NAME` into `web/.env`. It is
idempotent, so re-running it is safe.

Then:

```bash
npm test
```

To throw the data away and start clean:

```bash
./scripts/setup-test-db.sh --reset
```

## Connection strings

```
postgres://fdc_appuser:fdc_appuser@localhost:5435/shop_registry
```

`DATABASE_HOST_URL` in `web/.env` excludes the database name;
`SHOP_REGISTRY_DATABASE_NAME` is `shop_registry`. `connect.js` joins them.

pgAdmin is on <http://localhost:5050> (`admin@admin.com` / `root`) if you want
to poke at the data.

## Why not just `yarn build:db`?

`build.js` only creates the *shop registry* tables — `auto-timestamp`,
`shop_registry`, `portals`, `shopify_sessions` — plus the dev portal seed. That
is the right scope for production, where the per-shop tables live in per-shop
databases.

The DB-dependent jest suites run against the **central** pool and need
`line_items`, `orders`, `sales_sessions` and a seeded `users` table, so the
script applies the per-shop schemas into the central database too. That
unblocks:

- `web/database/line_items/lineItems.spec.js`
- `web/database/orders/orders.spec.js`
- `web/database/sales_sessions/salesSessions.spec.js`
- `web/fdc-modules/orders/controllers/lineItemMappings.spec.js`

Without it those four fail with `getaddrinfo EAI_AGAIN` — `config.js`'s yup
schema has no `.required()`, so a missing `DATABASE_HOST_URL` surfaces as a
DNS error rather than a config error.

`yarn build:db` also works against this database, if you want to re-apply just
the registry schema.

## Notes

- **Image is pinned to `postgres:16-alpine`.** The `postgres` tag is now 18+,
  which stores data under `/var/lib/postgresql/<major>` and refuses to start
  against the `/var/lib/postgresql/data` mount this compose file uses. Revisit
  the compose file when you want to move to 18.
- **TLS is required.** `connect.js` opens every pool with
  `ssl: { rejectUnauthorized: false, require: true }`, and the stock image
  ships no certificate. The script generates a throwaway self-signed pair into
  `local-db/certs/` (gitignored) and copies it into a named volume, chowned to
  the container's postgres uid. Postgres refuses to start if the private key is
  owned by anyone else, which is why it is copied in rather than bind-mounted.
  Verification is already disabled client-side, so a self-signed cert is fine.
- **Schema application order matters.** `users/schema.sql` drops `users`
  without `CASCADE`, so an existing `orders` table (which has an FK to it)
  would block it. The script drops `orders`, `line_items` and `sales_sessions`
  first, then applies `users` before `orders`.

## Tear down

```bash
docker compose -f local-db/docker-compose.yml down
```

Add `-v` to discard the data volumes as well.
