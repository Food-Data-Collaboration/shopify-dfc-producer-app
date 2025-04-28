/* eslint-disable object-curly-newline */
/* eslint-disable no-underscore-dangle */
import pg from 'pg';
import fs from 'fs';
import {
  toCamelCase,
  toParentChild,
  sanitizeCSVInjection
} from './utils/index.js';

import config from '../config.js';

const { Pool } = pg;

// Store pool connections for different shops
const dbConnections = {};

// Central registry
const centralConnectionString = `${config.DATABASE_HOST_URL}/${config.SHOP_REGISTRY_DATABASE_NAME}`;

// eslint-disable-next-line prefer-regex-literals
const isInsertOrUpdateRegex = new RegExp(/(UPDATE(.|\n)*SET)|(INSERT INTO)/i);

if (!centralConnectionString) {
  throw new Error('Environment variable DATABASE_HOST_URL/SHOP_REGISTRY_DATABASE_NAME must be set');
}

const centralPool = new Pool({
  max: 20,
  connectionString: centralConnectionString,
  ssl: { rejectUnauthorized: false, require: true }
});

// Default pool is the central registry pool
const pool = centralPool;

/**
 * Get shop connection details from the registry
 * @param {string} shopId - The shop ID to get connection details for
 * @returns {Promise<{dbName: string}>}
 */
const getShopConnectionDetails = async (shopId) => {
  try {
    const result = await centralPool.query(
      'SELECT shop_name, db_name FROM shops WHERE shop_name = $1',
      [shopId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const shop = result.rows[0];
    return {
      dbName: shop.db_name
    };
  } catch (error) {
    console.error('Error getting shop connection details:', error);
    throw error;
  }
};

/**
 * Get a database connection pool for a specific shop
 * @param {string} shopId - The shop ID to get a connection for
 * @returns {Promise<Pool>} - The database connection pool
 */
const getShopDbConnection = async (shopId) => {
  // Return the central pool if no shopId is provided
  if (!shopId) {
    return centralPool;
  }

  // Check if we already have a connection in memory
  if (dbConnections[shopId]) {
    return dbConnections[shopId];
  }

  // Get connection details from registry
  const connectionDetails = await getShopConnectionDetails(shopId);
  if (!connectionDetails) {
    throw new Error(`No database found for shop ID: ${shopId}`);
  }

  const shopConnectionString = `${config.DATABASE_HOST_URL}/${connectionDetails.dbName}`;

  const shopPool = new Pool({
    connectionString: shopConnectionString,
    max: 20,
    ssl: { rejectUnauthorized: false, require: true },
    idleTimeoutMillis: 30000
  });

  dbConnections[shopId] = shopPool;
  return shopPool;
};

/**
 * Execute a query on the database
 * @param {string} text - SQL query text
 * @param {Array} _params - Query parameters
 * @param {Object} client - Optional client to use for the query
 * @param {string} shopId - Optional shop ID to determine which database to connect to
 * @returns {Promise<Object>} - Query result
 */
const query = async (text, _params, client, shopId) => {
  let _pool;

  if (client) {
    _pool = client;
  } else if (shopId) {
    _pool = await getShopDbConnection(shopId);
  } else {
    _pool = centralPool;
  }

  let params = _params;
  const isInsertOrUpdate = isInsertOrUpdateRegex.test(text);

  if (isInsertOrUpdate) {
    params = sanitizeCSVInjection(_params);
  }

  try {
    const res = await _pool.query(text, params);

    if (res && res.rows) {
      const rows = toCamelCase(toParentChild(res.rows));
      res.rows = rows;
    }
    return res;
  } catch (e) {
    console.log('Error from query fun', e, 'with query', text);
    throw new Error(e);
  }
};

const readSqlFile = async (filePath, shopId) => {
  const sql = fs.readFileSync(filePath).toString();
  return query(sql, undefined, undefined, shopId);
};

export {
  query,
  readSqlFile,
  pool,
  centralPool,
  getShopDbConnection,
  getShopConnectionDetails
};
