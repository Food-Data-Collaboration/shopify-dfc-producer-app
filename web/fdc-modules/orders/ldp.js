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
  sendProblem
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
 * that adds `ldp:contains`.
 */
export const sendOrdersContainer = (req, res, graph, { pageInfo } = {}) => {
  if (pageInfo) {
    res.set('pageInfo', JSON.stringify(pageInfo));
  }
  return sendGraph(req, res, graph, { container: true });
};

/** `GET /Orders/:id` (and `GET /Orders/:id/orderLines`) — member framing. */
export const sendOrderMember = (req, res, graph) => {
  const [memberUri] = memberUrisIn(graph);
  return sendGraph(req, res, graph, {
    member: true,
    location: memberUri
  });
};

/**
 * `POST /Orders`, `PUT /Orders/:id`, `POST|PUT /Orders/:id/orderLines` — a
 * successful write returns the resulting member plus a `Location` so a
 * generic LDP client knows what it just created or changed.
 */
export const sendOrderWrite = (req, res, graph) => {
  const [memberUri] = memberUrisIn(graph);
  return sendGraph(req, res, graph, { member: true, location: memberUri });
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
