/**
 * Tests for the LDP framing on the Orders routes (Phase 3).
 *
 * The order *behaviour* is covered by `dfc-order.spec.js` and
 * `orders.spec.js`; what matters here is that the LDP layer added around it is
 * correct and, critically, that it did not change the bodies or status codes
 * that live hubs depend on.
 */
import {
  orderForbidden,
  orderLineMemberUri,
  orderMemberUri,
  orderNotFound,
  ordersContainerUri,
  sendOrderMember,
  sendOrderWrite,
  sendOrdersContainer
} from './ldp.js';
import { LDP_TYPES, host } from '../ldp/index.js';

const orderGraph = (orderId = '42') => JSON.stringify({
  '@context': 'https://w3id.org/dfc/ontology/v2.0.0/context/context_2.0.0.json',
  '@graph': [
    {
      '@id': `${host()}/api/dfc/Enterprises/acme/Orders/${orderId}`,
      '@type': 'dfc-b:Order'
    },
    {
      '@id': `${host()}/api/dfc/Enterprises/acme/Orders/${orderId}/orderLines/7`,
      '@type': 'dfc-b:OrderLine'
    }
  ]
});

const makeRes = () => {
  const res = {
    statusCode: null,
    body: undefined,
    headers: {},
    status(code) { res.statusCode = code; return res; },
    type(value) { res.headers['Content-Type'] = value; return res; },
    set(name, value) { res.headers[name] = value; return res; },
    get(name) { return res.headers[name]; },
    send(body) { res.body = body; return res; },
    end() { return res; }
  };
  return res;
};

const req = { method: 'GET', params: { EnterpriseName: 'acme' }, get: () => undefined };

describe('order URIs', () => {
  it('builds container, member and order-line URIs', () => {
    expect(ordersContainerUri('acme')).toBe(`${host()}/api/dfc/Enterprises/acme/Orders`);
    expect(orderMemberUri('acme', '42')).toBe(
      `${host()}/api/dfc/Enterprises/acme/Orders/42`
    );
    expect(orderLineMemberUri('acme', '42', '7')).toBe(
      `${host()}/api/dfc/Enterprises/acme/Orders/42/orderLines/7`
    );
  });
});

describe('sendOrdersContainer', () => {
  it('advertises the container types and Accept-Post', () => {
    const res = makeRes();
    sendOrdersContainer(req, res, orderGraph());

    expect(res.statusCode).toBe(200);
    expect(res.headers.Link).toContain(LDP_TYPES.CONTAINER);
    expect(res.headers['Accept-Post']).toBe('application/ld+json');
  });

  it('leaves the response body byte-identical to the connector graph', () => {
    // Hubs parse this body directly; the LDP work must not reshape it.
    const graph = orderGraph();
    const res = makeRes();
    sendOrdersContainer(req, res, graph);

    expect(res.body).toBe(graph);
  });

  it('passes through the Shopify pageInfo header when present', () => {
    const res = makeRes();
    const pageInfo = { hasNextPage: true, endCursor: 'abc' };

    sendOrdersContainer(req, res, orderGraph(), { pageInfo });

    expect(JSON.parse(res.headers.pageInfo)).toEqual(pageInfo);
  });
});

describe('sendOrderMember / sendOrderWrite', () => {
  it('advertises the member types, not the container types', () => {
    const res = makeRes();
    sendOrderMember(req, res, orderGraph());

    expect(res.headers.Link).toContain(LDP_TYPES.RESOURCE);
    expect(res.headers.Link).toContain(LDP_TYPES.RDF_SOURCE);
    expect(res.headers.Link).not.toContain(LDP_TYPES.CONTAINER);
  });

  it('sets Location to the order member URI on a write', () => {
    const res = makeRes();
    sendOrderWrite(req, res, orderGraph());

    expect(res.headers.Location).toBe(`${host()}/api/dfc/Enterprises/acme/Orders/42`);
  });

  it('leaves the write body untouched, so the DFC order graph still parses', () => {
    const graph = orderGraph();
    const res = makeRes();
    sendOrderWrite(req, res, graph);

    expect(res.body).toBe(graph);
    expect(JSON.parse(res.body)['@graph'][0]['@type']).toBe('dfc-b:Order');
  });
});

describe('order authorization problems', () => {
  it('reports a permission failure as a 403 problem document', () => {
    const res = makeRes();
    orderForbidden(req, res);

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.status).toBe(403);
    expect(body.detail).toBe('You do not have permission to act on this order');
  });

  it('reports a missing order as a 404 problem document', () => {
    const res = makeRes();
    orderNotFound(req, res);

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).detail).toBe('Unable to find order');
  });

  it('allows a caller to override the 404 detail', () => {
    const res = makeRes();
    orderNotFound(req, res, 'Order line not found');

    expect(JSON.parse(res.body).detail).toBe('Order line not found');
  });

  it('names the enterprise so a hub can route the failure', () => {
    const res = makeRes();
    orderForbidden(req, res);

    expect(JSON.parse(res.body).enterprise).toBe(
      `${host()}/api/dfc/Enterprises/acme`
    );
  });
});
