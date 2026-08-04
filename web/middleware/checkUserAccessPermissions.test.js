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
      'Token introspection failed - token inactive. Claims:',
      expect.any(String)
    );
    spy.mockRestore();
  });
});
