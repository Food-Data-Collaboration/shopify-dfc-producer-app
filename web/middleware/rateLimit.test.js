/**
 * Tests for the DFC rate limiter.
 *
 * The limiter guards the OIDC introspection call in
 * `checkUserAccessPermissions`, so the behaviour that matters is: a caller
 * cannot exhaust the budget, unrelated callers do not share one, and the
 * bucket key never grants or denies anything (it is a fairness device, not an
 * authorization check).
 */
import rateLimit from './rateLimit.js';

const makeRes = () => {
  const res = {
    statusCode: null,
    body: undefined,
    headers: {},
    status(code) { res.statusCode = code; return res; },
    type() { return res; },
    set(name, value) { res.headers[name] = value; return res; },
    get(name) { return res.headers[name]; },
    json(body) { res.body = body; return res; },
    send(body) { res.body = body; return res; },
    end() { return res; }
  };
  return res;
};

const makeReq = ({ tokenSet, authorization, ip = '10.0.0.1' } = {}) => ({
  tokenSet,
  ip,
  socket: { remoteAddress: ip },
  get: (name) => (name.toLowerCase() === 'authorization' ? authorization : undefined)
});

/** A minimal unsigned JWT carrying `sub`. Only the payload is ever read. */
const jwtWithSub = (sub) => {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64({ sub })}.signature`;
};

let limiter;

beforeEach(() => {
  limiter = rateLimit({ windowMs: 60_000, max: 3 });
  limiter.reset();
});

describe('rateLimit', () => {
  it('allows requests up to the limit and blocks the next one', () => {
    for (let i = 0; i < 3; i += 1) {
      const res = makeRes();
      let passed = false;
      limiter(makeReq(), res, () => { passed = true; });
      expect(passed).toBe(true);
    }

    const res = makeRes();
    let passed = false;
    limiter(makeReq(), res, () => { passed = true; });
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(429);
  });

  it('returns a problem document and a Retry-After header when limited', () => {
    for (let i = 0; i < 3; i += 1) {
      limiter(makeReq(), makeRes(), () => {});
    }

    const res = makeRes();
    limiter(makeReq(), res, () => {});

    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({ status: 429, title: 'Too many requests' });
    expect(res.headers['Retry-After']).toBe('60');
    expect(res.headers.Vary).toContain('Authorization');
  });

  it('keys on the OIDC client_id, so separate hubs get separate budgets', () => {
    const hubA = () => makeReq({ tokenSet: { client_id: 'hub-a' } });
    const hubB = () => makeReq({ tokenSet: { client_id: 'hub-b' } });

    for (let i = 0; i < 3; i += 1) {
      limiter(hubA(), makeRes(), () => {});
    }

    // hub-a is now exhausted...
    let aBlocked = false;
    limiter(hubA(), makeRes(), () => { aBlocked = true; });
    expect(aBlocked).toBe(false);

    // ...but hub-b is untouched.
    let bPassed = false;
    limiter(hubB(), makeRes(), () => { bPassed = true; });
    expect(bPassed).toBe(true);
  });

  it('spreads one user across buckets by token subject', () => {
    // Two different tokens, same IP, should not exhaust each other's budget.
    const tokenOne = jwtWithSub('user-1');
    const tokenTwo = jwtWithSub('user-2');

    for (let i = 0; i < 3; i += 1) {
      limiter(makeReq({ authorization: `Bearer ${tokenOne}`, ip: '10.0.0.9' }), makeRes(), () => {});
    }

    let passed = false;
    limiter(
      makeReq({ authorization: `Bearer ${tokenTwo}`, ip: '10.0.0.9' }),
      makeRes(),
      () => { passed = true; }
    );
    expect(passed).toBe(true);
  });

  it('falls back to the IP for an opaque token with no readable subject', () => {
    for (let i = 0; i < 3; i += 1) {
      limiter(makeReq({ authorization: 'Bearer opaque-nonsense', ip: '10.0.0.7' }), makeRes(), () => {});
    }

    let passed = false;
    limiter(
      makeReq({ authorization: 'Bearer opaque-nonsense', ip: '10.0.0.7' }),
      makeRes(),
      () => { passed = true; }
    );
    // Same IP, same unparseable token, so the same bucket is now full.
    expect(passed).toBe(false);
  });

  it('never throws on a malformed JWT in the Authorization header', () => {
    // A forged/garbage token must not be able to crash the limiter, which
    // would itself be a denial of service.
    expect(() => {
      limiter(makeReq({ authorization: 'Bearer a.b.c.d.e' }), makeRes(), () => {});
    }).not.toThrow();
  });

  it('honours the legacy "JWT " scheme the DFC hubs already send', () => {
    const token = jwtWithSub('user-3');

    for (let i = 0; i < 3; i += 1) {
      limiter(makeReq({ authorization: `JWT ${token}` }), makeRes(), () => {});
    }

    let passed = false;
    limiter(makeReq({ authorization: `JWT ${token}` }), makeRes(), () => { passed = true; });
    expect(passed).toBe(false);
  });

  it('lets a caller override the limited response', () => {
    const custom = rateLimit({ max: 1, onLimit: (req, res) => res.status(429).send('slow down') });
    custom.reset();

    custom(makeReq(), makeRes(), () => {});
    const res = makeRes();
    custom(makeReq(), res, () => {});

    expect(res.statusCode).toBe(429);
    expect(res.body).toBe('slow down');
  });

  it('uses the DFC_API defaults when constructed with no arguments', () => {
    const defaultLimiter = rateLimit();
    defaultLimiter.reset();
    const res = makeRes();

    let passed = true;
    for (let i = 0; i < 200; i += 1) {
      defaultLimiter(makeReq(), res, () => {});
      if (res.statusCode === 429) passed = false;
    }
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(429);
  });
});