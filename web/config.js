import * as dotenv from 'dotenv';
import path from 'path';
import * as yup from 'yup';

const envDir = process.cwd().endsWith('/web') ? process.cwd() : path.join(process.cwd(), '/web');

dotenv.config({ path: path.join(envDir, '.env') });

const schema = yup.object().shape({
  SHOPIFY_API_KEY: yup.string(),
  SHOPIFY_API_SECRET_KEY: yup.string(),
  OIDC_CLIENT_ID: yup.string(),
  OIDC_CLIENT_SECRET: yup.string(),
  HOST: yup.string(),
  APP_URL: yup.string(),
  NODE_ENV: yup.string(),
  DATABASE_HOST_URL: yup.string(),
  SHOP_REGISTRY_DATABASE_NAME: yup.string()
});

const createConfig = () => {
  let envVars;
  try {
    envVars = schema.validateSync(process.env, { stripUnknown: false });
  } catch (error) {
    if (error) {
      throw new Error(`Config validation error: ${error.message}`);
    }
  }

  return {
    SHOPIFY_API_KEY: envVars.SHOPIFY_API_KEY,
    SHOPIFY_API_SECRET_KEY: envVars.SHOPIFY_API_SECRET_KEY,
    HOST: envVars.HOST,
    OIDC_CLIENT_ID: envVars.OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET: envVars.OIDC_CLIENT_SECRET,
    APP_URL: envVars.APP_URL,
    NODE_ENV: envVars.NODE_ENV,
    DATABASE_HOST_URL: envVars.DATABASE_HOST_URL,
    SHOP_REGISTRY_DATABASE_NAME: envVars.SHOP_REGISTRY_DATABASE_NAME
  };
};

export default createConfig();
