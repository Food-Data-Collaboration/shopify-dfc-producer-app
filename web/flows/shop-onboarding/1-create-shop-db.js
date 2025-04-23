import pg from 'pg';
import config from '../../config.js';

const { Pool } = pg;

const createShopDatabase = async (shopName) => {
  // Normalize shop name for database naming
  const safeShopName = shopName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const dbName = `fdc_${safeShopName}`;
  const dbUser = `fdc_user_${safeShopName}`;

  const dbPassword = Math.random().toString(36).substring(2, 10) +
                    Math.random().toString(36).substring(2, 10);

  // Connect to postgres to create the database and user
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

    const userCheckResult = await pgPool.query(
      'SELECT usename FROM pg_catalog.pg_user WHERE usename = $1',
      [dbUser]
    );

    if (userCheckResult.rows.length === 0) {
      await pgPool.query(`CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}'`);
      console.log(`Created database user ${dbUser} for shop ${shopName}`);
    } else {
      await pgPool.query(`ALTER USER ${dbUser} WITH PASSWORD '${dbPassword}'`);
      console.log(`Updated password for user ${dbUser}`);
    }

    // Grant full privileges on the database
    await pgPool.query(`GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser}`);

    // Make the user the owner of the database to ensure full access
    await pgPool.query(`ALTER DATABASE ${dbName} OWNER TO ${dbUser}`);

    // Connect to the new database to set schema permissions
    const shopDbPool = new Pool({
      connectionString: `${config.DATABASE_HOST_URL}/${dbName}`,
      ssl: { rejectUnauthorized: false, require: true }
    });

    try {
      // Grant schema privileges - this is critical for full access
      await shopDbPool.query(`GRANT ALL ON SCHEMA public TO ${dbUser}`);
      await shopDbPool.query(`ALTER SCHEMA public OWNER TO ${dbUser}`);

      // Grant privileges on all existing objects
      await shopDbPool.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${dbUser}`);
      await shopDbPool.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${dbUser}`);
      await shopDbPool.query(`GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO ${dbUser}`);

      // Grant privileges on future objects
      await shopDbPool.query(`ALTER DEFAULT PRIVILEGES FOR USER ${dbUser} IN SCHEMA public GRANT ALL ON TABLES TO ${dbUser}`);
      await shopDbPool.query(`ALTER DEFAULT PRIVILEGES FOR USER ${dbUser} IN SCHEMA public GRANT ALL ON SEQUENCES TO ${dbUser}`);
      await shopDbPool.query(`ALTER DEFAULT PRIVILEGES FOR USER ${dbUser} IN SCHEMA public GRANT ALL ON FUNCTIONS TO ${dbUser}`);

      console.log(`Granted full schema access to ${dbUser} on database ${dbName}`);
    } finally {
      await shopDbPool.end();
    }

    return {
      dbName,
      dbUser,
      dbPassword
    };
  } catch (error) {
    console.error(`Error creating database for shop ${shopName}:`, error);
    throw error;
  } finally {
    await pgPool.end();
  }
};

export default createShopDatabase;
