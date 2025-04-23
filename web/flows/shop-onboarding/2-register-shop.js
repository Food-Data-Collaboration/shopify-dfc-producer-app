import { query } from '../../database/connect.js';

const registerShop = async (shopName, { dbName, dbUser, dbPassword }) => {
  try {
    const result = await query(
      `INSERT INTO shops 
       (shop_name, installed_at, setup_completed, db_name, db_username, db_password) 
       VALUES ($1, CURRENT_TIMESTAMP, FALSE, $2, $3, $4)
       RETURNING *`,
      [shopName, dbName, dbUser, dbPassword]
    );

    console.log(`Registered shop ${shopName} in registry`);
    return result.rows[0];
  } catch (error) {
    console.error(`Error registering shop ${shopName}:`, error);
    throw error;
  }
};

export default registerShop;
