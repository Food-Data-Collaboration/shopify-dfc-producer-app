import pg from 'pg';
import config from '../../config.js';

const { Pool } = pg;

const createShopDatabase = async (shopName) => {
  // Normalize shop name for database naming
  const safeShopName = shopName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const dbName = `fdc_${safeShopName}`;

  // Connect to postgres to create the database
  const pgPool = new Pool({
    connectionString: `${config.DATABASE_HOST_URL}/postgres`,
    ssl: { rejectUnauthorized: false, require: true }
  });

  try {
    const dbCheckResult = await pgPool.query(
      'SELECT datname FROM pg_catalog.pg_database WHERE datname = $1',
      [dbName]
    );

    if (dbCheckResult.rows.length === 0) {
      await pgPool.query(`CREATE DATABASE ${dbName}`);
      console.log(`Created database ${dbName} for shop ${shopName}`);
    }

    // Get the central DB username from connection string
    const hostUrlMatch = config.DATABASE_HOST_URL.match(/postgres:\/\/(.*):(.*)@(.*):(.*)/);
    const centralDbUser = hostUrlMatch ? hostUrlMatch[1] : null;

    if (centralDbUser) {
      // Connect to the new database to set schema permissions
      const shopDbPool = new Pool({
        connectionString: `${config.DATABASE_HOST_URL}/${dbName}`,
        ssl: { rejectUnauthorized: false, require: true }
      });

      try {
        // Ensure the central user has proper permissions
        await shopDbPool.query(`GRANT ALL ON SCHEMA public TO ${centralDbUser}`);
        await shopDbPool.query(`ALTER SCHEMA public OWNER TO ${centralDbUser}`);

        // Grant privileges on all existing objects
        await shopDbPool.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${centralDbUser}`);
        await shopDbPool.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${centralDbUser}`);
        await shopDbPool.query(`GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO ${centralDbUser}`);

        console.log(`Granted schema access to central user on database ${dbName}`);
      } finally {
        await shopDbPool.end();
      }
    }

    return {
      dbName
    };
  } catch (error) {
    console.error(`Error creating database for shop ${shopName}:`, error);
    throw error;
  } finally {
    await pgPool.end();
  }
};

export default createShopDatabase;
