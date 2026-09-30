# LDP dataserver — hub interop runbook

Manual verification of the LDP surface against a live DFC hub. The jest suites
(`web/fdc-modules/{ldp,scopes,profile,products,orders}/*.spec.js`) cover the
protocol mechanics; this checklist covers the parts a unit test cannot: real
OIDC tokens, a real Shopify session, and a hub actually consuming the graph.

## Prerequisites

- The app running against a shop with the **orders feature enabled** (otherwise
  `checkScopePermissions` consults `portal_permissions` and you need a portal
  row per scope).
- A hub with the DFC scopes for this shop, and an OIDC user the shop owner has
  approved in **Settings → Hub users** (`users.status = true`).
- A **published** variant: tick a variant as shareable in the embedded app so
  an `fdc_variants` row with `enabled = true` exists.

```bash
export HOST="https://<dataserver-host>/"      # must end in a slash (AGENTS.md gotcha)
export TOKEN="<OIDC access token>"
export ENTERPRISE="<shop name>"                # the EnterpriseName, not the myshopify domain
base="https://<dataserver-host>/api/dfc/Enterprises/$ENTERPRISE"
```

## 1. Discovery

```bash
curl -sS "$HOST/profile" | jq .
```

Expect: a `foaf:PersonalProfileDocument` @graph, the `SuppliedProducts` and
`Orders` container URIs listed under `dcterms:hasPart`, and `dfc-t:scopes`
containing `ReadProducts` / `WriteProducts` / `ReadOrders` / `WriteOrders`.

```bash
curl -sS "$HOST/api/scopes" | jq '.["dfc-t:scopes"]["@list"] | length'
```

## 2. Container discovery and method advertisement

```bash
curl -sS -D- -o/dev/null -H "Authorization: JWT $TOKEN" "$base/SuppliedProducts"
```

Expect `Content-Type: application/ld+json`, an `ETag`, a `Link` header
containing `<http://www.w3.org/ns/ldp#Container>`, `Accept-Post`, and
`Access-Control-Expose-Headers` listing `Link`/`ETag`/`Location`.

The body should be an `ldp:Container` **and** carry a top-level `@graph` (the
same members) for older hubs. Confirm both:

```bash
curl -sS -H "Authorization: JWT $TOKEN" "$base/SuppliedProducts" \
  | jq '{type: ."@type", contains: (."ldp:contains" | length), graph: (."@graph" | length)}'
```

`OPTIONS` should advertise the container verbs; on a member, the write verbs:

```bash
curl -sS -X OPTIONS -D- -o/dev/null -H "Authorization: JWT $TOKEN" "$base/SuppliedProducts"
curl -sS -X OPTIONS -D- -o/dev/null -H "Authorization: JWT $TOKEN" "$base/SuppliedProducts/<variantId>"
```

Expect `Allow: GET, POST, HEAD, OPTIONS` then
`Allow: GET, PUT, PATCH, DELETE, HEAD, OPTIONS`.

## 3. Read a member, then re-read it conditionally

```bash
curl -sS -D/tmp/h -o/dev/null -H "Authorization: JWT $TOKEN" "$base/SuppliedProducts/<variantId>"
etag=$(grep -i '^etag:' /tmp/h | cut -d' ' -f2- | tr -d '\r')

curl -sS -o/dev/null -w '%{http_code}\n' -H "Authorization: JWT $TOKEN" \
  -H "If-None-Match: $etag" "$base/SuppliedProducts/<variantId>"
```

Expect **304**. A **200** here means the ETag does not cover the bytes we send —
check that the graph is deterministic across calls (the connector's blank-node
counter is a likely culprit, see the note at the bottom).

## 4. Conditional write

```bash
curl -sS -o/dev/null -w '%{http_code}\n' -X PATCH \
  -H "Authorization: JWT $TOKEN" -H 'Content-Type: application/ld+json' \
  -H "If-Match: \"stale\"" \
  --data @payload.json "$base/SuppliedProducts/<variantId>"
```

Expect **412**. With the live ETag, expect **200** (and **304** if the write was
a no-op… in practice the ETag will differ, so expect 200).

`Prefer: return=minimal` should collapse a successful write to 204 + `Location`:

```bash
curl -sS -D- -o/dev/null -X PATCH -H "Authorization: JWT $TOKEN" \
  -H 'Content-Type: application/ld+json' -H 'Prefer: return=minimal' \
  --data @payload.json "$base/SuppliedProducts/<variantId>"
```

## 5. Unpublish, then confirm the product survived

```bash
curl -sS -o/dev/null -w '%{http_code}\n' -X DELETE \
  -H "Authorization: JWT $TOKEN" "$base/SuppliedProducts/<variantId>"

# still in the merchant's admin?
curl -sS -o/dev/null -w '%{http_code}\n' -H "Authorization: JWT $TOKEN" \
  "$base/SuppliedProducts/<variantId>"     # 404 — unpublished from the federation
```

**The Shopify product must still exist.** This is the most important check in
this runbook: a federation caller must never be able to delete a merchant's
catalogue entry.

## 6. Authorization matrix

Confirm each of these. A wrong status here is a security bug, not a cosmetic one.

| Request | Expected | Why |
|---|---|---|
| No `Authorization` header | 403 | `checkUserAccessPermissions` |
| Valid token, unapproved user id | 403 | not in `users` with `status = true` |
| Valid token, `ReadProducts` only, POST | 403 | `checkScopePermissions` needs `WriteProducts` |
| Valid token, `WriteProducts`, DELETE an unpublished variant | 404 | never-published is not a permission failure |
| POST with a v1 `@context` | 415 | v2-only dataserver, no silent coercion |
| POST whose `dfc-b:isVariantOf` names a deleted product | 404 | no dangling mapping left behind |
| POST the same variant twice | 409 | already in the container |
| `GET /api/dfc/Enterprises/<name>` with `POST` | 405 + `Allow` | enterprises are read-only |

## 7. Orders still behave

The LDP work on Orders was framing-only; confirm the existing contract is intact.

```bash
# GET the container: status 200, body is a bare DFC graph, pageInfo header present
curl -sS -D- -H "Authorization: JWT $TOKEN" "$base/Orders" | head -20

# POST a DFC order: status must be 200 (NOT 201) and must carry Location
curl -sS -D- -o/dev/null -X POST -H "Authorization: JWT $TOKEN" \
  -H 'Content-Type: application/json' --data @order.json "$base/Orders"
```

Expect `200` and a `Location: …/Orders/<id>`. `201` would break live hubs.

Then confirm the hub round-trip: a `PUT` that completes an order
(`dfc-v:Complete`) must still complete the Shopify draft order, and a
`GET /Orders/<id>` you do not own must be a **403** problem document.

## Known rough edges to confirm with the hub

- **`ProductId` is a product, not a variant.** The route param is a Shopify
  *product* id while the DFC member `@id` is a *variant* id, so
  `GET /SuppliedProducts/<productId>` returns the whole product group. Hubs that
  dereference the member `@id` it was handed are fine; a hub that rewrites the
  last path segment will not be.
- **Blank-node ids are counters** (`_:b1`, `_:qty_1`), so identical data
  serialises with different blank-node names between processes. This does not
  break JSON-LD, but it does mean ETags are not stable across restarts — only
  across requests in one process. If step 3 ever returns 200, this is why.
- **POST publishes rather than creates.** A hub trying to create a brand-new
  product will get a 400 asking for `dfc-b:isVariantOf`. That is deliberate; a
  DFC graph does not carry enough to make a viable catalogue entry.
