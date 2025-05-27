import { readSqlFile } from '../../database/connect.js';

const buildShopTables = async (shopName, connectionDetails = {}) => {
  console.log(`Building initial tables for shop ${shopName}`);

  try {
    // SQL files to execute in order
    const sqlFiles = [
      'auto-timestamp.sql',
      'webhooks/schema.sql',
      'users/schema.sql',
      'variants/schema.sql',
      'line_items/schema.sql',
      'sales_sessions/schema.sql',
      'orders/schema.sql'
    ];

    // Execute each SQL file for the shop's database
    for (const sqlFile of sqlFiles) {
      try {
        await readSqlFile(
          `${process.cwd()}/database/${sqlFile}`,
          shopName
        );
        console.log(`Applied ${sqlFile} to shop database ${connectionDetails.dbName}`);
      } catch (err) {
        console.warn(`Warning: Error applying ${sqlFile}: ${err.message}`);
      }
    }

    console.log(`Successfully built tables for shop ${shopName}`);
  } catch (error) {
    console.error(`Error building tables for shop ${shopName}:`, error);
    throw error;
  }
};

export default buildShopTables;
