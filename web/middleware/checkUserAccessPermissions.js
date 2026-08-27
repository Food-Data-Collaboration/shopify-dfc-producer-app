import { Issuer, custom } from 'openid-client';
import { query } from '../database/connect.js';

const clientId = process.env.OIDC_CLIENT_ID;
const clientSecret = process.env.OIDC_CLIENT_SECRET;
const issuerURL = process.env.OIDC_ISSUER;

custom.setHttpOptionsDefaults({
  timeout: 5000
});

const checkUserAccessPermissions = async (req, res, next) => {
  const accessToken = bearerToken(req);

  await authorise(accessToken, req, res, next);
};

async function getUserTokenSet(accessToken) {
  try {
    const issuer = await Issuer.discover(issuerURL);

    const client = new issuer.Client({
      client_id: clientId,
      client_secret: clientSecret
    });

    return { tokenSet: await client.introspect(accessToken) };
  } catch (error) {
    return { error };
  }
}

async function authorise(accessToken, req, res, next) {
  if (!accessToken) {
    logInactiveTokenDiagnostics(null, 'token missing');
    return res.status(403).json({
      message: 'User access denied - token missing',
      error: 'User not authorized'
    });
  }

  const { error, tokenSet } = await getUserTokenSet(accessToken);

  if (error) {
    return next(error);
  }

  if (!tokenSet.active) {
    return handleInactiveToken(res, accessToken);
  }

  req.tokenSet = tokenSet;

  const userId = tokenSet.username;
  const { name } = tokenSet;
  const { shopName } = req;

  req.user = {
    id: userId,
    email: tokenSet.email
  };

  // If orders feature is not enabled, skip user-based authorization
  // Scope-based authorization will be handled by checkScopePermissions middleware
  if (!shopName || !req.shop?.ordersFeatureEnabled) {
    return next();
  }

  try {
    const user = await query('SELECT * FROM users WHERE user_id = $1', [
      userId
    ], undefined, shopName);

    if (!user || user.rows.length === 0) {
      // insert this user into the database with status false
      await query(
        'INSERT INTO users (user_id, status, name) VALUES ($1,$2,$3)',
        [userId, false, name],
        undefined,
        shopName
      );

      logInactiveTokenDiagnostics(accessToken, `user not found in database (${userId})`);
      return res.status(403).json({
        message: 'User access denied',
        error: 'User not found in database'
      });
    }

    const { status } = user.rows[0];

    if (status) {
      return next();
    }

    logInactiveTokenDiagnostics(accessToken, `user not authorized (${userId})`);
    return res.status(403).json({
      message: 'User access denied',
      error: 'User not authorized'
    });
  } catch (err) {
    return res.status(500).json({
      message: 'User access denied',
      error: err.message
    });
  }
}

function bearerToken(req) {
  const token = req.get('authorization');
  return token?.split(' ')[1];
}

function decodeJwtPayload(accessToken) {
  try {
    const payload = accessToken.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString());
  } catch {
    return null;
  }
}

function handleInactiveToken(res, accessToken) {
  const payload = decodeJwtPayload(accessToken);
  logInactiveTokenDiagnostics(accessToken, 'token inactive / introspected as not active', payload);

  if (payload) {
    const now = Date.now() / 1000;
    const isExpired = payload.exp && payload.exp < now;
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud].filter(Boolean);
    const audienceMismatch = clientId && audiences.length > 0 && !audiences.includes(clientId);

    if (isExpired) {
      return res.status(403).json({
        message: 'User access denied - token expired',
        error: `Token expired at ${new Date(payload.exp * 1000).toISOString()}`
      });
    }

    if (audienceMismatch) {
      return res.status(403).json({
        message: 'User access denied - token not accepted by the identity provider',
        error: `Audience mismatch: token issued for "${payload.aud}" but introspected as client "${clientId}"`
      });
    }

    return res.status(403).json({
      message: 'User access denied - token not accepted by the identity provider',
      error: `Token inactive for an unknown reason (audience: "${payload.aud}")`
    });
  }

  // undecodable opaque tokens are intentionally silent unless diagnostics enabled
  // (LOG_AUTH_DIAGNOSTICS=1 or legacy LOG_INACTIVE_TOKEN_DIAGNOSTICS=1) — generic 403 preserves no-leak behavior
  return res.status(403).json({
    message: 'User access denied - token not accepted by the identity provider',
    error: 'User not authorized'
  });
}

function logInactiveTokenDiagnostics(accessToken, context, cachedPayload) {
  // LOG_AUTH_DIAGNOSTICS is the current name; LOG_INACTIVE_TOKEN_DIAGNOSTICS kept as deprecated alias
  if (process.env.LOG_AUTH_DIAGNOSTICS !== '1' && process.env.LOG_INACTIVE_TOKEN_DIAGNOSTICS !== '1') {
    return;
  }

  const payload = cachedPayload !== undefined ? cachedPayload : decodeJwtPayload(accessToken);
  const safeClaims = {};

  if (payload) {
    ['iss', 'sub', 'aud', 'exp', 'iat', 'azp', 'jti'].forEach((claim) => {
      if (payload[claim] !== undefined) {
        safeClaims[claim] = payload[claim];
      }
    });
  }

  console.error(
    `Token denied (${context}).`,
    !accessToken
      ? 'No access token present'
      : !payload
        ? 'JWT payload claims: <decode failed - opaque/invalid JWT>'
        : `JWT payload claims: ${JSON.stringify(safeClaims, null, 2)}`
  );
}

export default checkUserAccessPermissions;
