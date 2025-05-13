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
    return res.status(403).json({
      message: 'User access denied - token expired',
      error: 'User not authorized'
    });
  }

  const userId = tokenSet.username;
  const { name } = tokenSet;
  const { shopName } = req;

  req.user = {
    id: userId,
    email: tokenSet.email
  };

  if (!(req.baseUrl + req.path).includes('/Orders')) {
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

export default checkUserAccessPermissions;
