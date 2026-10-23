/**
 * Tests for the DFC rate limiter.
 *
 * The limiter guards the OIDC introspection call in
 * `checkUserAccessPermissions`, so the behaviour that matters is: a caller
 * cannot exhaust the budget, unrelated callers do not share one, and the
 * bucket key never grants or denies anything (it is a fairness device, not an
 * authorization check).
 *
 * `no-await-in-loop` is off for this file: the limiter's whole purpose is to
 * count sequential requests, so the awaits are inherent to the assertions.
 */
/* eslint-disable no-await-in-loop */
import { rateLimit as expressRateLimit } from 'express-rate-limit';
import rateLimiterOptions from './rateLimit.js';

/** Build a limiter the way `app.js` does, with the store and handler in place. */
const makeLimiter = (options) => expressRateLimit(rateLimiterOptions(options));

const makeRes = () => {
  const res = {
    statusCode: null,
    body: undefined,
    headers: {},
    status(code) { res.statusCode = code; return res; },
    type() { return res; },
    set(name, value) { res.headers[name] = value; return res; },
    setHeader(name, value) { res.headers[name] = value; return res; },
    append(name, value) {
      res.headers[name] = res.headers[name] ? `${res.headers[name]}, ${value}` : value;
      return res;
    },
    get(name) { return res.headers[name]; },
    getHeader(name) { return res.headers[name]; },
    json(body) { res.body = body; return res; },
    send(body) { res.body = body; return res; },
    end() { return res; }
  };
  return res;
};

const makeReq = ({ tokenSet, authorization, ip = '10.0.0.1' } = {}) => ({
  tokenSet,
  ip,
  // Express always provides these two; express-rate-limit reads `headers`
  // and `app.get('trust proxy')` while validating the request.
  headers: {},
  app: { get: () => false },
  socket: { remoteAddress: ip },
  get: (name) => (name.toLowerCase() === 'authorization' ? authorization : undefined)
});

/** A minimal unsigned JWT carrying `sub`. Nothing in the limiter reads it. */
const jwtWithSub = (sub) => {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64({ sub })}.signature`;
};

let limiter;

beforeEach(() => {
  // A fresh limiter owns a fresh MemoryStore, so counts cannot leak between
  // tests and no explicit reset is needed.
  limiter = makeLimiter({ windowMs: 60_000, max: 3 });
});

describe('rateLimit', () => {
  it('allows requests up to the limit and blocks the next one', async () => {
    for (let i = 0; i < 3; i += 1) {
      const res = makeRes();
      let passed = false;
      await limiter(makeReq(), res, () => { passed = true; });
      expect(passed).toBe(true);
    }

    const res = makeRes();
    let passed = false;
    await limiter(makeReq(), res, () => { passed = true; });
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(429);
  });

  it('returns a problem document and a Retry-After header when limited', async () => {
    for (let i = 0; i < 3; i += 1) {
      await limiter(makeReq(), makeRes(), () => {});
    }

    const res = makeRes();
    await limiter(makeReq(), res, () => {});

    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({ status: 429, title: 'Too many requests' });
    expect(res.headers['Retry-After']).toBe('60');
    expect(res.headers.Vary).toContain('Authorization');
  });

  it('keys on the OIDC client_id, so separate hubs get separate budgets', async () => {
    const hubA = () => makeReq({ tokenSet: { client_id: 'hub-a' } });
    const hubB = () => makeReq({ tokenSet: { client_id: 'hub-b' } });

    for (let i = 0; i < 3; i += 1) {
      await limiter(hubA(), makeRes(), () => {});
    }

    // hub-a is now exhausted...
    let aBlocked = false;
    await limiter(hubA(), makeRes(), () => { aBlocked = true; });
    expect(aBlocked).toBe(false);

    // ...but hub-b is untouched.
    let bPassed = false;
    await limiter(hubB(), makeRes(), () => { bPassed = true; });
    expect(bPassed).toBe(true);
  });

  it('does not give a forged `sub` a fresh bucket', async () => {
    // The limiter runs *before* introspection, so `sub` read out of an
    // unverified token payload is entirely attacker-controlled. Keying on it
    // would let anyone mint unlimited buckets with an unsigned token, defeating
    // the limit entirely. Everything pre-introspection must share the IP bucket.
    for (let i = 0; i < 3; i += 1) {
      await limiter(
        makeReq({ authorization: `Bearer ${jwtWithSub('user-1')}`, ip: '10.0.0.9' }),
        makeRes(),
        () => {}
      );
    }

    let passed = false;
    await limiter(
      // Same IP, different forged subject — must NOT get a clean budget.
      makeReq({ authorization: `Bearer ${jwtWithSub('user-2')}`, ip: '10.0.0.9' }),
      makeRes(),
      () => { passed = true; }
    );
    expect(passed).toBe(false);
  });

  it('cannot be walked around by sending a new forged subject each time', async () => {
    // The practical attack: one caller, a distinct `sub` per request. Over the
    // limit's worth of attempts, only `max` may succeed.
    let allowed = 0;
    const countAllowed = () => { allowed += 1; };

    for (let i = 0; i < 20; i += 1) {
      await limiter(
        makeReq({ authorization: `Bearer ${jwtWithSub(`attacker-${i}`)}`, ip: '10.0.0.9' }),
        makeRes(),
        countAllowed
      );
    }

    expect(allowed).toBe(3);
  });

  it('falls back to the IP for an opaque token with no readable subject', async () => {
    for (let i = 0; i < 3; i += 1) {
      await limiter(makeReq({ authorization: 'Bearer opaque-nonsense', ip: '10.0.0.7' }), makeRes(), () => {});
    }

    let passed = false;
    await limiter(
      makeReq({ authorization: 'Bearer opaque-nonsense', ip: '10.0.0.7' }),
      makeRes(),
      () => { passed = true; }
    );
    // Same IP, same unparseable token, so the same bucket is now full.
    expect(passed).toBe(false);
  });

  it('never throws on a malformed JWT in the Authorization header', async () => {
    // A forged/garbage token must not be able to crash the limiter, which
    // would itself be a denial of service.
    await expect(
      limiter(makeReq({ authorization: 'Bearer a.b.c.d.e' }), makeRes(), () => {})
    ).resolves.toBeUndefined();
  });

  it('shares the IP bucket for the legacy "JWT " scheme', async () => {
    // The hubs send `JWT ` rather than `Bearer `. Both are opaque to us before
    // introspection, so both key on the address.
    for (let i = 0; i < 3; i += 1) {
      await limiter(makeReq({ authorization: `JWT ${jwtWithSub('user-3')}`, ip: '10.0.0.11' }), makeRes(), () => {});
    }

    let passed = false;
    await limiter(
      makeReq({ authorization: `JWT ${jwtWithSub('user-3')}`, ip: '10.0.0.11' }),
      makeRes(),
      () => { passed = true; }
    );
    expect(passed).toBe(false);
  });

  it('still separates clients once introspection has supplied a client_id', async () => {
    // The verified key, and the only one an attacker cannot choose.
    const a = () => makeReq({ tokenSet: { client_id: 'hub-a' }, ip: '10.0.0.20' });
    const b = () => makeReq({ tokenSet: { client_id: 'hub-b' }, ip: '10.0.0.20' });

    for (let i = 0; i < 3; i += 1) {
      await limiter(a(), makeRes(), () => {});
    }

    let aBlocked = false;
    await limiter(a(), makeRes(), () => { aBlocked = true; });
    expect(aBlocked).toBe(false);

    let bPassed = false;
    await limiter(b(), makeRes(), () => { bPassed = true; });
    expect(bPassed).toBe(true);
  });

  it('lets a caller override the limited response', async () => {
    const custom = makeLimiter({ max: 1, onLimit: (req, res) => res.status(429).send('slow down') });

    await custom(makeReq(), makeRes(), () => {});
    const res = makeRes();
    await custom(makeReq(), res, () => {});

    expect(res.statusCode).toBe(429);
    expect(res.body).toBe('slow down');
  });

  it('uses the DFC_API defaults when constructed with no arguments', async () => {
    const defaultLimiter = makeLimiter();
    const res = makeRes();

    let passed = true;
    for (let i = 0; i < 200; i += 1) {
      await defaultLimiter(makeReq(), res, () => {});
      if (res.statusCode === 429) {
        passed = false;
      }
    }
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(429);
  });
});
