import { query } from '../../database/connect.js';

const postOnboardingActions = async (shopName) => {
  console.log(`Performing post-onboarding actions for shop ${shopName}`);

  try {
    // Mark the shop as setup completed
    const result = await query(
      'UPDATE shops SET setup_completed = TRUE WHERE shop_name = $1 RETURNING *',
      [shopName]
    );

    if (result.rows.length === 0) {
      throw new Error(`Shop ${shopName} not found in registry`);
    }

    console.log(`Shop ${shopName} setup marked as completed`);

    return result.rows[0];
  } catch (error) {
    console.error(`Error performing post-onboarding actions for shop ${shopName}:`, error);
    throw error;
  }
};

export default postOnboardingActions;
