const mockQuery = jest.fn();
jest.mock('../database/connect.js', () => ({ query: (...args) => mockQuery(...args) }));

const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

const sign = (claims) => `${encode({ alg: 'none' })}.${encode(claims)}.signature`;

describe('checkUserAccessPermissions - inactive token diagnostics', () => {
  let checkUserAccessPermissions;
  let mockClient;

  beforeEach(async () => {
    jest.resetModules();
    process.env.OIDC_CLIENT_ID = 'fdc-producer';
    process.env.OIDC_CLIENT_SECRET = 'secret';
    process.env.OIDC_ISSUER = 'https://issuer.example/auth/realms/test';

    mockClient = {
      introspect: jest.fn()
    };

    jest.doMock('openid-client', () => {
      class MockIssuer {
        constructor() {
          this.Client = jest.fn().mockReturnValue(mockClient);
        }
      }
      return {
        Issuer: { discover: jest.fn().mockResolvedValue(new MockIssuer()) },
        custom: { setHttpOptionsDefaults: jest.fn() }
      };
    });

    const mod = await import('./checkUserAccessPermissions.js');
    checkUserAccessPermissions = mod.default;
  });

  const callMiddleware = async (token) => {
    const req = { get: (h) => (h === 'authorization' ? `Bearer ${token}` : undefined) };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await checkUserAccessPermissions(req, res, next);
    return { res, next };
  };

  test('expired token returns expired message', async () => {
    mockClient.introspect.mockResolvedValue({ active: false });
    const token = sign({ exp: Math.floor(Date.now() / 1000) - 100, aud: 'account' });
    const { res } = await callMiddleware(token);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'User access denied - token expired' })
    );
  });

  test('active:false with future exp and audience mismatch reports audience', async () => {
    mockClient.introspect.mockResolvedValue({ active: false });
    const token = sign({ exp: Math.floor(Date.now() / 1000) + 3600, aud: 'account' });
    const { res } = await callMiddleware(token);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'User access denied - token not accepted by the identity provider',
        error: expect.stringContaining('Audience mismatch')
      })
    );
  });

  test('active:false with matching audience reports unknown reason', async () => {
    mockClient.introspect.mockResolvedValue({ active: false });
    const token = sign({ exp: Math.floor(Date.now() / 1000) + 3600, aud: 'fdc-producer' });
    const { res } = await callMiddleware(token);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'User access denied - token not accepted by the identity provider',
        error: expect.stringContaining('unknown reason')
      })
    );
  });

  test('active introspection proceeds to next() when ordersFeature disabled', async () => {
    mockClient.introspect.mockResolvedValue({
      active: true,
      username: 'garethe@fooddatacollaboration.org.uk',
      email: 'garethe@fooddatacollaboration.org.uk',
      name: 'Garethe Hughes'
    });
    const token = sign({ exp: Math.floor(Date.now() / 1000) + 3600 });
    const { res, next } = await callMiddleware(token);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('audience mismatch is detected when aud is an array', async () => {
    mockClient.introspect.mockResolvedValue({ active: false });
    const token = sign({
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: ['some-other-client', 'account']
    });
    const { res } = await callMiddleware(token);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'User access denied - token not accepted by the identity provider',
        error: expect.stringContaining('Audience mismatch')
      })
    );
  });

  test('no mismatch when aud array includes the producer client', async () => {
    mockClient.introspect.mockResolvedValue({ active: false });
    const token = sign({
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: ['fdc-producer', 'account']
    });
    const { res } = await callMiddleware(token);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'User access denied - token not accepted by the identity provider',
        error: expect.stringContaining('unknown reason')
      })
    );
  });

  test('diagnostics logging is gated behind env var', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.LOG_INACTIVE_TOKEN_DIAGNOSTICS = '1';
    mockClient.introspect.mockResolvedValue({ active: false });
    const token = sign({ exp: Math.floor(Date.now() / 1000) + 3600, aud: 'account' });
    await callMiddleware(token);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Token denied'),
      expect.stringContaining('JWT payload claims')
    );
    spy.mockRestore();
  });

  test('diagnostics logging works with primary LOG_AUTH_DIAGNOSTICS flag', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.LOG_INACTIVE_TOKEN_DIAGNOSTICS;
    process.env.LOG_AUTH_DIAGNOSTICS = '1';
    mockClient.introspect.mockResolvedValue({ active: false });
    const token = sign({ exp: Math.floor(Date.now() / 1000) + 3600, aud: 'account' });
    await callMiddleware(token);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Token denied'),
      expect.stringContaining('JWT payload claims')
    );
    spy.mockRestore();
    delete process.env.LOG_AUTH_DIAGNOSTICS;
  });

  test('token missing logs when diagnostics enabled', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.LOG_AUTH_DIAGNOSTICS = '1';
    const req = { get: () => undefined, shop: {}, shopName: 'test-shop' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await checkUserAccessPermissions(req, res, next);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Token denied'),
      expect.stringContaining('No access token present')
    );
    expect(res.status).toHaveBeenCalledWith(403);
    spy.mockRestore();
    delete process.env.LOG_AUTH_DIAGNOSTICS;
  });

  test('user not found logs without PII when diagnostics enabled', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.LOG_AUTH_DIAGNOSTICS = '1';
    mockClient.introspect.mockResolvedValue({
      active: true,
      username: 'missing@example.com',
      email: 'missing@example.com',
      name: 'Missing User'
    });
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const token = sign({ sub: 'user-sub-123', exp: Math.floor(Date.now() / 1000) + 3600 });
    const req = {
      get: (h) => (h === 'authorization' ? `Bearer ${token}` : undefined),
      shop: { ordersFeatureEnabled: true },
      shopName: 'test-shop'
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await checkUserAccessPermissions(req, res, next);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('user not found'),
      expect.stringContaining('JWT payload claims')
    );
    // PII redaction: raw email must not appear in diagnostic context
    expect(spy.mock.calls[0][0]).not.toContain('missing@example.com');
    // correlation via allowlisted sub claim
    expect(spy.mock.calls[0][1]).toContain('user-sub-123');
    spy.mockRestore();
    delete process.env.LOG_AUTH_DIAGNOSTICS;
  });

  test('user not authorized logs without PII when diagnostics enabled', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.LOG_AUTH_DIAGNOSTICS = '1';
    mockClient.introspect.mockResolvedValue({
      active: true,
      username: 'blocked@example.com',
      email: 'blocked@example.com',
      name: 'Blocked User'
    });
    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce({ rows: [{ status: false }] });
    const token = sign({ sub: 'blocked-sub-456', exp: Math.floor(Date.now() / 1000) + 3600 });
    const req = {
      get: (h) => (h === 'authorization' ? `Bearer ${token}` : undefined),
      shop: { ordersFeatureEnabled: true },
      shopName: 'test-shop'
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await checkUserAccessPermissions(req, res, next);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('user not authorized'),
      expect.stringContaining('JWT payload claims')
    );
    expect(spy.mock.calls[0][0]).not.toContain('blocked@example.com');
    expect(spy.mock.calls[0][1]).toContain('blocked-sub-456');
    spy.mockRestore();
    delete process.env.LOG_AUTH_DIAGNOSTICS;
  });

  test('no diagnostics log when env vars not set', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.LOG_AUTH_DIAGNOSTICS;
    delete process.env.LOG_INACTIVE_TOKEN_DIAGNOSTICS;
    mockClient.introspect.mockResolvedValue({ active: false });
    const token = sign({ exp: Math.floor(Date.now() / 1000) + 3600, aud: 'account' });
    await callMiddleware(token);
    // token missing path also gated
    const req = { get: () => undefined, shop: {}, shopName: 'test-shop' };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await checkUserAccessPermissions(req, res, jest.fn());
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('diagnostics log pretty-prints safe claims', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.LOG_AUTH_DIAGNOSTICS = '1';
    mockClient.introspect.mockResolvedValue({ active: false });
    const token = sign({ iss: 'https://issuer.example', sub: 'user123', aud: 'account', exp: Math.floor(Date.now() / 1000) + 3600 });
    await callMiddleware(token);
    const payloadArg = spy.mock.calls[0][1];
    expect(payloadArg).toContain('\n'); // pretty-printed JSON contains newline
    expect(payloadArg).toContain('"iss"');
    spy.mockRestore();
    delete process.env.LOG_AUTH_DIAGNOSTICS;
  });

  test('opaque token decode failure emits distinct <decode failed> diagnostic', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.LOG_AUTH_DIAGNOSTICS = '1';
    mockClient.introspect.mockResolvedValue({ active: false });
    // opaque / invalid JWT: payload not base64 JSON, decode returns null
    const opaqueToken = 'not.a.jwt';
    const { res } = await callMiddleware(opaqueToken);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Token denied'),
      expect.stringContaining('<decode failed')
    );
    // must not emit empty object which would be ambiguous with valid decoded token
    const payloadArg = spy.mock.calls[0][1];
    expect(payloadArg).not.toContain('"iss"');
    expect(payloadArg).toContain('opaque/invalid JWT');
    spy.mockRestore();
    delete process.env.LOG_AUTH_DIAGNOSTICS;
  });
});
