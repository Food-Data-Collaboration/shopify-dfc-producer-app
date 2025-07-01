# Food Data Collaboration Producer

# Getting Started / How to Run the App Locally

## Pre-Requirements 

1. You must [download and install Node.js](https://nodejs.org/en/download/) if you don't already have it.
1. You must [create a Shopify partner account](https://partners.shopify.com/signup) if you don’t have one.
1. You must [create a development store](https://help.shopify.com/en/partners/dashboard/development-stores#create-a-development-store) if you don’t have one.

## Running a local Version of the App

1. **Read the Main Product Readme**: Familiarize yourself with the project by reading the [main Product Readme](https://github.com/yalla-coop/food-data-collaboration-producer/blob/staging/README_MAIN_PRODUCT.md).

2. **Clone the Repository**: Clone this repository to your local machine.

3. **Create Environment File**: In the `/web` folder of the project, create a `.env` file.

4. **Install Dependencies**: Run the following commands to install all necessary dependencies:
   
```bash
yarn install
cd web
yarn install
cd frontend
yarn install
```
   
5. **Build the Database:** 

- Inside /local-db you will find an optional way of creating a postgres docker container and a connection string to be used for local development
- There is a Readme + Dockerfile with all required steps
- Once the DB is setup you can build the development data by executing (from root):
  
```bash
yarn build:db
```

6. **Install Shopify CLI:** Ensure that the Shopify CLI is installed on your system.
  
7. **Run the App:** Start the application with the command:
```bash
yarn dev --reset
```

8. **Connect to Shopify:** Follow the on-screen instructions to input your Shopify details for connecting the application.

9. **Update Environment File:** After the app is connected and installed on your Shopify store, update the .env file with the newly generated **SHOPIFY_API_KEY** and **SHOPIFY_API_SECRET_KEY** from the Shopify Partners App Settings. Also, grant permissions for the app to access protected customer data.

10. **Restart the Application:** Restart the app and run:
```bash
yarn dev
```

## Useful Resources
- [Main Product Readme](https://github.com/yalla-coop/food-data-collaboration-producer/blob/staging/README_MAIN_PRODUCT.md)
- [Database Overview](https://github.com/yalla-coop/food-data-collaboration-producer/blob/6af3fb3eeb328da489b2923fb2c0bc49cf704073/DATABASE_OVERVIEW.md)
- [Deployment Strategy](https://github.com/yalla-coop/food-data-collaboration-producer/blob/6af3fb3eeb328da489b2923fb2c0bc49cf704073/DEPLOYMENT_STRATEGY.md)
