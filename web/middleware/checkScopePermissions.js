import { query } from '../database/connect.js';
import { getRequiredScope } from '../fdc-modules/scopes/matrix.js';

const checkScopePermissions = async (req, res, next) => {
  try {
    if (req.shop?.ordersFeatureEnabled) {
      return next();
    }

    const { tokenSet, shopName, method } = req;

    if (!tokenSet || !tokenSet.client_id) {
      return res.status(401).json({
        message: 'Access denied - invalid token',
        error: 'Missing client_id in token'
      });
    }

    if (!shopName) {
      return res.status(400).json({
        message: 'Access denied - shop not identified',
        error: 'Shop name not found'
      });
    }

    // This middleware runs on an `app.use` mount, so express strips the mount
    // path: `req.path` is relative ('/' for the container, '/42' for a member)
    // and `req.route` is undefined. Rejoin baseUrl + path to get the absolute
    // path the matrix is keyed on, and fall back to the raw path for safety.
    const absolutePath = `${req.baseUrl || ''}${req.path || ''}`.replace(/\/+$/, '') || '/';
    const requiredScope = getRequiredScope(absolutePath, method)
      ?? getRequiredScope(req.route?.path || req.path, method);

    if (!requiredScope) {
      return res.status(404).json({
        message: 'Endpoint not found or not supported',
        error: `No DFC scope is defined for ${method} ${absolutePath}`
      });
    }

    const portalId = tokenSet.client_id;
    const hasPermission = await checkPlatformPermissions(portalId, shopName, requiredScope);

    if (!hasPermission) {
      return res.status(403).json({
        message: 'Access denied - insufficient permissions',
        error: `Platform ${portalId} does not have ${requiredScope} permission for shop ${shopName}`
      });
    }

    next();
  } catch (error) {
    console.error('Error in checkScopePermissions:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
};

const checkPlatformPermissions = async (platformId, shopName, requiredScope) => {
  try {
    const shopResult = await query(
      'SELECT id FROM shops WHERE shop_name = $1',
      [shopName]
    );

    if (shopResult.rows.length === 0) {
      return false;
    }

    const shopId = shopResult.rows[0].id;

    // Check if portal has the required scope for this shop
    const permissionResult = await query(
      `SELECT pp.scope 
       FROM portal_permissions pp
       JOIN portal_listing pl ON pp.portal = pl.id
       WHERE pl.id = $1 AND pp.producer = $2 AND pp.scope = $3`,
      [platformId, shopId, requiredScope]
    );

    return permissionResult.rows.length > 0;
  } catch (error) {
    console.error('Error checking platform permissions:', error);
    return false;
  }
};

export default checkScopePermissions;
