#!/usr/bin/env bash
#
# Bring up a local postgres for the test suite, with every schema the DB
# dependent tests need.
#
#   ./scripts/setup-test-db.sh          # start + migrate
#   ./scripts/setup-test-db.sh --reset  # throw the volume away first
#
# Why this exists rather than `yarn build:db`:
#
#   build.js only creates the *shop registry* tables (auto-timestamp,
#   shop_registry, portals, shopify_sessions) plus the dev portal seed. The
#   DB-dependent jest suites run against the **central** pool and need
#   `line_items`, `orders`, `sales_sessions` and a seeded `users` table,
#   which in production live in per-shop databases. So this script applies the
#   per-shop schemas into the central database as well.
#
# The 4 suites this unblocks are web/database/{line_items,orders,sales_sessions}
# and web/fdc-modules/orders/controllers/lineItemMappings.
#
# No root or sudo required: postgres runs in Docker.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_DB="$REPO_ROOT/local-db"
CERTS="$LOCAL_DB/certs"
DB_CONTAINER="container-pg"
DB_PORT="${DB_PORT:-5435}"
DB_SUPERUSER="${DB_SUPERUSER:-admin}"
DB_SUPERPASSWORD="${DB_SUPERPASSWORD:-root}"
APP_USER="${APP_USER:-fdc_appuser}"
APP_PASSWORD="${APP_PASSWORD:-fdc_appuser}"
REGISTRY_DB="${SHOP_REGISTRY_DATABASE_NAME:-shop_registry}"

# nodenv: `web/` declares engines node >=20.10.0 and yarn refuses to install
# on the shell's default node 18.
if [ -d "$HOME/.nodenv/versions" ]; then
  NODENV_BIN="$(ls -1 "$HOME/.nodenv/versions" 2>/dev/null | sort -V | tail -1)"
  if [ -n "$NODENV_BIN" ]; then
    export PATH="$HOME/.nodenv/versions/$NODENV_BIN/bin:$PATH"
  fi
fi

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[33mwarning: %s\033[0m\n' "$*" >&2; }
die() { printf '\033[31merror: %s\033[0m\n' "$*" >&2; exit 1; }

# Run psql inside the container as the superuser. init-database.sql is only
# applied by the entrypoint on a *fresh* volume, so a re-run of this script
# against an existing volume must be able to re-create the role/databases.
psql_super() {
  docker exec -i -e PGPASSWORD="$DB_SUPERPASSWORD" "$DB_CONTAINER" \
    psql -v ON_ERROR_STOP=1 -U "$DB_SUPERUSER" -d postgres "$@"
}

# Install the TLS pair into the container's /certs volume, owned by the
# database user (uid 70). Postgres refuses to start if the private key is owned
# by anyone else, which rules out a read-only bind mount from the host.
install_certs() {
  say "Installing TLS certs into the container"
  docker cp "$CERTS/server.crt" "$DB_CONTAINER:/certs/server.crt"
  docker cp "$CERTS/server.key" "$DB_CONTAINER:/certs/server.key"
  # 70 is the alpine postgres user's uid; chown as root inside the container.
  docker exec -u 0 "$DB_CONTAINER" chown 70:70 /certs/server.crt /certs/server.key
  docker exec -u 0 "$DB_CONTAINER" chmod 600 /certs/server.key
  docker exec -u 0 "$DB_CONTAINER" chmod 644 /certs/server.crt
}

require() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not on PATH. $2"
}

# ---------------------------------------------------------------- preflight
require docker "Install Docker: https://docs.docker.com/get-docker/"
docker info >/dev/null 2>&1 || die "the Docker daemon is not reachable. Is it running, and are you in the 'docker' group?"

# ------------------------------------------------------------ self-signed TLS
# connect.js demands SSL, and the stock image has no certificate. Generate a
# throwaway one rather than pointing at the host's snakeoil certs, which do
# not exist inside the container. Verification is disabled on the client, so
# a self-signed cert is sufficient for local development.
generate_certs() {
  if [ -f "$CERTS/server.crt" ] && [ -f "$CERTS/server.key" ]; then
    say "TLS certs already present in local-db/certs"
    return
  fi

  say "Generating a self-signed TLS cert into local-db/certs"
  require openssl "Install openssl, or drop a server.crt/server.key pair into local-db/certs by hand."
  mkdir -p "$CERTS"
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$CERTS/server.key" \
    -out "$CERTS/server.crt" \
    -days 3650 \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1
  chmod 600 "$CERTS/server.key"
  # The container runs as uid 70 (postgres); the host key is 0600 owned by us.
  chmod 644 "$CERTS/server.key"
}

# ------------------------------------------------------------------ lifecycle
if [ "${1:-}" = "--reset" ]; then
  say "--reset: removing the existing container and volumes"
  docker compose -f "$LOCAL_DB/docker-compose.yml" down -v >/dev/null 2>&1 || true
  docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true
fi

generate_certs

say "Starting postgres on localhost:$DB_PORT"
# The container cannot start until the certs are in place and correctly owned,
# so the loop below installs them on the first pass and then restarts.
started_fresh=0
if [ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null || echo false)" != "true" ]; then
  started_fresh=1
fi

# Bring the container up far enough to `docker cp` into it. If it is crash
# looping on the missing certs that is expected; the first successful exec
# below is what installs them.
docker compose -f "$LOCAL_DB/docker-compose.yml" up -d postgres || true

# Wait for the container to exist and be exec-able (even if postgres itself is
# still crash-looping, `docker cp` and `docker exec -u 0` work).
for attempt in $(seq 1 30); do
  if docker exec "$DB_CONTAINER" true >/dev/null 2>&1; then
    break
  fi
  [ "$attempt" -eq 30 ] && die "container $DB_CONTAINER did not start"
  sleep 1
done

if [ "$started_fresh" -eq 1 ] || ! docker exec "$DB_CONTAINER" test -f /certs/server.crt 2>/dev/null; then
  install_certs
  # The server only re-reads its SSL config at startup.
  docker restart "$DB_CONTAINER" >/dev/null
fi

say "Waiting for postgres to accept connections"
for attempt in $(seq 1 60); do
  if docker exec "$DB_CONTAINER" pg_isready -U "$DB_SUPERUSER" -d postgres >/dev/null 2>&1; then
    say "postgres is ready"
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    docker logs --tail 30 "$DB_CONTAINER" >&2 || true
    die "postgres did not become ready within 60s"
  fi
  sleep 1
done

# ------------------------------------------------------------------ bootstrap
# The entrypoint only runs init-database.sql against a fresh volume, so make
# the bootstrap idempotent here too. These mirror local-db/init-database.sql.
say "Ensuring role '$APP_USER' and the databases exist"
psql_super <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$APP_USER') THEN
    CREATE ROLE $APP_USER WITH PASSWORD '$APP_PASSWORD' CREATEDB CREATEROLE SUPERUSER;
  ELSE
    ALTER ROLE $APP_USER WITH PASSWORD '$APP_PASSWORD' CREATEDB CREATEROLE SUPERUSER;
  END IF;
END
\$\$;
SQL

for db in "$REGISTRY_DB" fdc_producer fdc_hub; do
  if ! psql_super -tAc "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -q 1; then
    say "Creating database $db"
    psql_super -c "CREATE DATABASE \"$db\" OWNER $APP_USER" >/dev/null
  fi
  psql_super -c "GRANT ALL PRIVILEGES ON DATABASE \"$db\" TO $APP_USER" >/dev/null
  psql_super -c "ALTER DATABASE \"$db\" OWNER TO $APP_USER" >/dev/null
done

# --------------------------------------------------------------------- schema
# Applied with psql -f over stdin, because `readSqlFile` goes through the
# central pool and needs DATABASE_HOST_URL configured first (which is what the
# next step writes). Doing it in dependency order:
#
#   1. auto-timestamp    defines trigger_set_timestamp(), used by every schema
#   2. users             orders has an FK to users(id)
#   3. orders            must precede users: users/schema.sql drops users
#                        without CASCADE, so an existing orders table would
#                        block it. Drop the dependents first instead.
#   4. line_items, sales_sessions, variants, webhooks  independent
#   5. shop_registry, portals, shopify_sessions          (what build.js does)
#   6. seeds/dev.sql     a portal to satisfy the portal_permissions FK
#   7. users/test-users  fixed ids 10-15; orders.spec.js asserts ownerId 10
apply_sql() {
  local label="$1" file="$2"
  say "Applying $label"
  docker exec -i -e PGPASSWORD="$APP_PASSWORD" "$DB_CONTAINER" \
    psql -v ON_ERROR_STOP=1 -U "$APP_USER" -d "$REGISTRY_DB" -q \
    < "$REPO_ROOT/web/database/$file"
}

# Break the users <-> orders dependency so the per-shop schemas are re-appliable.
psql_super -d "$REGISTRY_DB" -q -c 'DROP TABLE IF EXISTS orders, line_items, sales_sessions CASCADE' >/dev/null

apply_sql "auto-timestamp"      "auto-timestamp.sql"
apply_sql "users"               "users/schema.sql"
apply_sql "orders"              "orders/schema.sql"
apply_sql "line_items"          "line_items/schema.sql"
apply_sql "sales_sessions"      "sales_sessions/schema.sql"
apply_sql "variants"            "variants/schema.sql"
apply_sql "webhooks"            "webhooks/schema.sql"
apply_sql "shop_registry"       "shop_registry/schema.sql"
apply_sql "portals"             "portals/schema.sql"
apply_sql "shopify_sessions"    "build.sql"
apply_sql "dev seeds"           "seeds/dev.sql"

# test-users.sql is a plain INSERT, so it is not re-runnable. Clear the rows it
# owns first, then apply it.
say "Seeding test users (needed by orders.spec.js, which asserts ownerId 10)"
psql_super -d "$REGISTRY_DB" -q -c 'TRUNCATE users RESTART IDENTITY CASCADE' >/dev/null
apply_sql "test users" "users/test-users.sql"

# ------------------------------------------------------------------- env file
# config.js reads web/.env, and its yup schema has no .required(), so missing
# vars surface as confusing runtime failures (the "getaddrinfo EAI_AGAIN"
# you see without this) rather than a config error.
say "Writing DATABASE_* into web/.env"
ENV_FILE="$REPO_ROOT/web/.env"
CONNECTION_STRING="postgres://$APP_USER:$APP_PASSWORD@localhost:$DB_PORT"

touch "$ENV_FILE"

# Drop any previous values *and* our own marker, keeping every other setting
# (HOST, OIDC_*, ...). The marker has to be stripped too, or re-running the
# script stacks a copy of it on every invocation.
grep -vE '^(DATABASE_HOST_URL|SHOP_REGISTRY_DATABASE_NAME)=|^# Added by scripts/setup-test-db\.sh$' \
  "$ENV_FILE" > "$ENV_FILE.tmp" || true
mv "$ENV_FILE.tmp" "$ENV_FILE"

# Drop trailing blank lines so repeated runs don't accumulate whitespace.
sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$ENV_FILE" 2>/dev/null || true

{
  echo
  echo "# Added by scripts/setup-test-db.sh"
  echo "DATABASE_HOST_URL=$CONNECTION_STRING"
  echo "SHOP_REGISTRY_DATABASE_NAME=$REGISTRY_DB"
} >> "$ENV_FILE"

# ----------------------------------------------------------------- sanity
say "Tables now present in $REGISTRY_DB"
docker exec -e PGPASSWORD="$APP_PASSWORD" "$DB_CONTAINER" \
  psql -U "$APP_USER" -d "$REGISTRY_DB" -tAc \
  "SELECT string_agg(tablename, ', ' ORDER BY tablename) FROM pg_tables WHERE schemaname='public'" \
  | tr -d '[:space:]'

cat <<EOF

$(say "Done")

  connection string : $CONNECTION_STRING/$REGISTRY_DB
  host url          : $CONNECTION_STRING
  registry database : $REGISTRY_DB
  pgadmin           : http://localhost:5050 (admin@admin.com / root)

Run the tests:

  npm test

Tear down:

  docker compose -f local-db/docker-compose.yml down
  # or, to discard the data too:
  docker compose -f local-db/docker-compose.yml down -v
EOF
