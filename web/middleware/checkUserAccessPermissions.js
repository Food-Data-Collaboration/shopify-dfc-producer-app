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

      return res.status(403).json({
        message: 'User access denied',
        error: 'User not found in database'
      });
    }

    const { status } = user.rows[0];

    if (status) {
      return next();
    }

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
    return JSON.parse(Buffer.from(payload, 'base64').toString());
  } catch {
    return null;
  }
}

function handleInactiveToken(res, accessToken) {
  const payload = decodeJwtPayload(accessToken);

  if (payload) {
    console.error(
      'Token introspection failed - token inactive. Token payload:',
      JSON.stringify(payload, null, 2)
    );

    const now = Date.now() / 1000;
    const isExpired = payload.exp && payload.exp < now;
    const audienceMismatch =
      payload.aud && clientId && !String(payload.aud).includes(clientId);

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

  console.error(
    'Token introspection failed - token inactive. Could not decode JWT payload:',
    accessToken
  );

  return res.status(403).json({
    message: 'User access denied - token expired',
    error: 'User not authorized'
  });
}

export default checkUserAccessPermissions;
