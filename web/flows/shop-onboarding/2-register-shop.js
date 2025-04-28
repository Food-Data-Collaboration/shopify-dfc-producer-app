import { query } from '../../database/connect.js';

const registerShop = async (shopName, { dbName }) => {
  try {
    const result = await query(
      `INSERT INTO shops 
       (shop_name, installed_at, setup_completed, db_name) 
       VALUES ($1, CURRENT_TIMESTAMP, FALSE, $2)
       RETURNING *`,
      [shopName, dbName]
    );

    console.log(`Registered shop ${shopName} in registry`);
    return result.rows[0];
  } catch (error) {
    console.error(`Error registering shop ${shopName}:`, error);
    throw error;
  }
};

export default registerShop;
