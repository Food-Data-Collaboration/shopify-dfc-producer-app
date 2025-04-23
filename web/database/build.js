import pg from 'pg';
import config from '../config.js';
import { readSqlFile } from './connect.js';

const { Pool } = pg;

const setupShopRegistryTables = async () => {
  const dbHostUrl = config.DATABASE_HOST_URL;
  const shopRegistryDbName = config.SHOP_REGISTRY_DATABASE_NAME;
  const connectionString = `${dbHostUrl}/${shopRegistryDbName}`;

  console.log('Setting up shop registry tables at:', connectionString);

  if (dbHostUrl.includes('amazonaws')) {
    throw new Error("You're rebuilding an environment, I'm not going to do that");
  }

  // Connect directly to the shop_registry database - assumes it exists
  const registryPool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false, require: true }
  });

  try {
    // Check if we can connect to the database
    try {
      await registryPool.query('SELECT 1');
      console.log('Connected to shop_registry database');
    } catch (err) {
      console.error('Error connecting to shop_registry database:', err.message);
      throw new Error(
        'Cannot connect to shop_registry database. Please ensure it exists and is accessible.'
      );
    }

    try {
      await readSqlFile(`${process.cwd()}/web/database/auto-timestamp.sql`);
      await readSqlFile(`${process.cwd()}/web/database/shop_registry/schema.sql`);
      await readSqlFile(`${process.cwd()}/web/database/build.sql`);
      console.log('Successfully set up shop_registry tables');
    } catch (err) {
      console.error('Error creating shop_registry tables:', err);
      throw err;
    }
  } finally {
    await registryPool.end();
  }
};

setupShopRegistryTables().catch((err) => {
  console.error('Database build failed:', err);
  process.exit(1);
});
