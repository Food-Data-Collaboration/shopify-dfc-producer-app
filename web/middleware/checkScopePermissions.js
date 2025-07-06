import { query } from '../database/connect.js';

const SCOPE_MAPPING = {
  GET: {
    '/api/dfc/Enterprises': 'ReadEnterprise',
    '/api/dfc/Enterprises/:EnterpriseName': 'ReadEnterprise',
    '/api/dfc/Enterprises/:EnterpriseName/Orders': 'ReadOrders',
    '/api/dfc/Enterprises/:EnterpriseName/SuppliedProducts': 'ReadProducts',
    '/api/dfc/Enterprises/:EnterpriseName/Portals': 'ReadEnterprise'
  },
  POST: {
    '/api/dfc/Enterprises/:EnterpriseName/Orders': 'WriteOrders',
    '/api/dfc/Enterprises/:EnterpriseName/SuppliedProducts': 'WriteProducts',
    '/api/dfc/Enterprises/:EnterpriseName/Portals': 'WriteEnterprise'
  },
  PUT: {
    '/api/dfc/Enterprises/:EnterpriseName/Orders': 'WriteOrders',
    '/api/dfc/Enterprises/:EnterpriseName/SuppliedProducts': 'WriteProducts',
    '/api/dfc/Enterprises/:EnterpriseName/Portals': 'WriteEnterprise'
  }
};

const checkScopePermissions = async (req, res, next) => {
  try {
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

    const requiredScope = getRequiredScope(req.route?.path || req.path, method);

    if (!requiredScope) {
      return res.status(404).json({
        message: 'Endpoint not found or not supported',
        error: 'Invalid endpoint'
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

const getRequiredScope = (path, method) => {
  const methodScopes = SCOPE_MAPPING[method];

  if (!methodScopes) {
    return null;
  }

  // Try exact match first
  if (methodScopes[path]) {
    return methodScopes[path];
  }

  // Try pattern matching for parameterized routes
  for (const [pattern, scope] of Object.entries(methodScopes)) {
    if (matchRoute(pattern, path)) {
      return scope;
    }
  }

  return null;
};

const matchRoute = (pattern, path) => {
  // Convert pattern like '/api/dfc/Enterprises/:EnterpriseName' to regex
  const regex = pattern.replace(/:[^/]+/g, '[^/]+');
  return new RegExp(`^${regex}$`).test(path);
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
