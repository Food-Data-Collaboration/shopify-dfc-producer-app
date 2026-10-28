/**
 * LDP framing for the Orders routes.
 *
 * Orders are not part of the DFC ontology that DjangoLDP models (it has no
 * Order class at all), so there is nothing to replicate from the reference
 * implementation — but hubs still traverse `/Orders` as an LDP container, and
 * today every response is a bare body with `Content-Type: application/json`.
 *
 * This module retrofits the Phase 0 protocol headers onto the existing
 * controllers without changing the response bodies: a DFC Order graph is
 * `{"@context", "@graph": [...]}` or a single member, and hubs that already
 * parse that shape must keep working. The container additionally advertises
 * `ldp:contains` so generic LDP clients can enumerate members, and every
 * write gains a `Location` header pointing at the member URI.
 */
import {
  containerUri,
  sendGraph,
  sendProblem,
  sendWriteResult
} from '../ldp/index.js';

/** `{HOST}api/dfc/Enterprises/{shop}/Orders` */
export const ordersContainerUri = (enterpriseName) =>
  containerUri('api/dfc/Enterprises', enterpriseName, 'Orders');

/** `{HOST}api/dfc/Enterprises/{shop}/Orders/{orderId}` */
export const orderMemberUri = (enterpriseName, orderId) =>
  containerUri('api/dfc/Enterprises', enterpriseName, 'Orders', orderId);

/** `{HOST}api/dfc/Enterprises/{shop}/Orders/{orderId}/orderLines/{lineId}` */
export const orderLineMemberUri = (enterpriseName, orderId, lineId) =>
  containerUri('api/dfc/Enterprises', enterpriseName, 'Orders', orderId, 'orderLines', lineId);

const memberUrisIn = (graph) => {
  const parsed = typeof graph === 'string' ? JSON.parse(graph) : graph;
  const nodes = Array.isArray(parsed) ? parsed : parsed['@graph'] || [parsed];
  return nodes
    .map((node) => node['@id'])
    .filter((id) => typeof id === 'string' && id.includes('/Orders/'));
};

/**
 * `GET /Orders` — the container. The body stays the plain DFC graph; the
 * LDP-specific information is in the headers plus the `container: true` flag
 * that adds `ldp:contains`. `writable: true` because POST /Orders exists.
 */
export const sendOrdersContainer = (req, res, graph, { pageInfo } = {}) => {
  if (pageInfo) {
    res.set('pageInfo', JSON.stringify(pageInfo));
  }
  return sendGraph(req, res, graph, { container: true, writable: true });
};

/** `GET /Orders/:id` — member framing. */
export const sendOrderMember = (req, res, graph) => {
  const [memberUri] = memberUrisIn(graph);
  return sendGraph(req, res, graph, {
    member: true,
    writable: true,
    // Orders support PUT on members, not PATCH: advertise PUT in `Allow` (via
    // the explicit OPTIONS methods list) but do not advertise `Accept-Patch`,
    // or a hub would PATCH a route that can only 404.
    patchable: false,
    location: memberUri
  });
};

/** `{HOST}api/dfc/Enterprises/{shop}/Orders/{orderId}/orderLines` */
export const orderLinesContainerUri = (enterpriseName, orderId) =>
  containerUri('api/dfc/Enterprises', enterpriseName, 'Orders', orderId, 'orderLines');

/**
 * `GET /Orders/:id/orderLines` — container framing, not member framing.
 *
 * This route returns a *collection* of order lines and accepts POST, so it is
 * an `ldp:Container`. Framing it as a resource was wrong twice over: it
 * advertised `Accept-Patch` for a collection, and pointed `Location` at the
 * first line as though that line were the representation of this URI. `pageInfo`
 * still rides in its own header, which is where the paging cursor belongs.
 */
export const sendOrderLinesContainer = (req, res, graph, { pageInfo } = {}) => {
  if (pageInfo) {
    res.set('pageInfo', JSON.stringify(pageInfo));
  }
  return sendGraph(req, res, graph, {
    container: true,
    writable: true
  });
};

/**
 * `POST /Orders`, `PUT /Orders/:id`, `POST|PUT /Orders/:id/orderLines` — a
 * successful write returns the resulting member plus a `Location` so a
 * generic LDP client knows what it just created or changed.
 *
 * Routes through `sendWriteResult` so every order write honours
 * `Prefer: return=minimal` (RFC 7240). The default status stays 200, not the
 * 201 LDP specifies, because live hubs and our acceptance test assert 200.
 */
export const sendOrderWrite = (req, res, graph) => {
  const [memberUri] = memberUrisIn(graph);
  return sendWriteResult(req, res, {
    status: 200,
    body: graph,
    member: true,
    writable: true,
    // See sendOrderMember: PUT only, no PATCH advertisement.
    patchable: false,
    location: memberUri
  });
};

/**
 * Order authorization failures are currently bare `.send()` strings. Map them
 * onto problem documents so a hub can tell "you may not read this order"
 * (403) from "it isn't there" (404) without string matching.
 */
export const orderForbidden = (req, res) =>
  sendProblem(req, res, 403, {
    title: 'Forbidden',
    detail: 'You do not have permission to act on this order'
  });

export const orderNotFound = (req, res, detail = 'Unable to find order') =>
  sendProblem(req, res, 404, { title: 'Not found', detail });
