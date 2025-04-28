import createShopDatabase from './1-create-shop-db.js';
import registerShop from './2-register-shop.js';
import buildShopTables from './3-build-shop-tables.js';
import postOnboardingActions from './4-post-onboarding-actions.js';

/**
 * Handles the shop onboarding flow
 * @param {string} shopName - The shop name from session
 * @returns {Promise<object>} - The registered shop record
 */
export const triggerShopOnboardingFlow = async (shopName) => {
  try {
    console.log(`Starting onboarding flow for shop ${shopName}`);

    console.log('Step 1: Creating shop database...');
    const connectionDetails = await createShopDatabase(shopName);

    console.log('Step 2: Registering shop in registry...');
    await registerShop(
      shopName,
      connectionDetails
    );

    console.log('Step 3: Building shop tables...');
    await buildShopTables(shopName, connectionDetails);

    console.log('Step 4: Performing post-onboarding actions...');
    const updatedShop = await postOnboardingActions(shopName);

    console.log(`Shop onboarding flow completed successfully for ${shopName}`);
    return updatedShop;
  } catch (error) {
    console.error(`Shop onboarding flow failed for ${shopName}:`, error);
    throw error;
  }
};

export default {
  triggerShopOnboardingFlow
};
