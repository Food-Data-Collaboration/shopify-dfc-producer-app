# Food Data Collaboration

## Product Vision

*In this section, we will delve into the core of our product - its vision, objectives, audience, stakeholders, and budget.*

**Client summary**

The [UK Food Data Collaboration](https://fooddatacollaboration.org.uk/) is a project to integrate UK short supply chain food distribution platforms with the [Data Food Consortium](https://www.datafoodconsortium.org/en/) (DFC) Ontology, creating a UK Local Food Data Commons. The project is being hosted by the [Open Food Network UK](https://openfoodnetwork.org.uk/) and is funded by [The National Lottery Community Fund](https://www.tnlcommunityfund.org.uk/).

See the [Technical partner tendering document](https://fooddatacollaboration.org.uk/work-with-us/) available on their website for more context.

**Vision Statement**

The ultimate goal of this product is to facilitate the wholesale and re-sale of [agroecologically](https://www.fao.org/agroecology/overview/overview10elements/en/) produced and harvested products, bridging the gap between consumers and producers, for a more sustainable planet.

**Key Objectives**

Key objectives and deliverables for this project are:

- Provide a custom made Shopify app for producers, that allows them to
    - Select which of their products should be sold via the Food Data Collaboration network
    - Map retail and trade variants
    - Receive wholesale orders from hubs
- Provide a custom made Shopify app for hubs, that allows them to
    - Connect to a producer’s store by authenticating on the OIDC server of Les Communs
    - Create a sales session
    - Add to their store any of the products / variant mappings previously made available by the producer
    - Enable them to edit the retail - wholesale markup to maximise profits
 - Create a platform-agnostic API that enables authenticated users to read and write Shopify product and order data by transforming the data model into the DFC-based ontology.

The apps are currently deployed on Jelastic Cloud and we only support the connection between one Producer and one Hub.

**Target Audience**

The main users of this product are Hub managers, who are small producers or small stores that wish to re-sell products of local wholesale suppliers.

The secondary users are Producers, who can choose which products to make available to the Hubs.

Lastly, we have end customers, who will be purchasing from the Hub online stores. They won’t be involved with the whole logic of the apps but they expect a seamless purchasing experience.


## Technical Design Document

*This section provides an in-depth look into the processes and strategies behind our product's design and development.*

### 1. Shopify Application for Producer Store

**Repository**
https://github.com/yalla-coop/food-data-collaboration-producer

**Stack:**
Backend: NodeJS, Express, PostgreSQL
Frontend: React
Version Control: GitHub
Containerization: Docker
Deployment: Jelastic Cloud

**Main Flows:**
- Getting Products and Variants from Shopify
- Mapping Variant Combinations and making them available for the FDC Network
- Processing Wholesale Orders from Hubs during Sales Sessions
- Managing OIDC Authenticated Users to grant / revoke access
- Exposing DFC Standardized API Endpoints for products and orders

```
Frontend (React) <--> Backend (Express + NodeJS) <--> Database (PostgreSQL)
     ▲
     |
     ▼
Shopify API (graphQl) <--> Product & Variants / Orders
     ▲
     |
     ▼
DFC Network <--> Standardising Product and Order API endpoints
     ▲
     |
     ▼
OIDC Authentication <--> Hub Users need to be authorised
```
**Main API DFC Endpoints**
_GET '/api/dfc/Enterprises/:EnterpriseName/Orders'_
_GET '/api/dfc/Enterprises/:EnterpriseName/SuppliedProducts'_

### 2. Shopify Application for Hub Store

**Repository**
https://github.com/yalla-coop/food-data-collaboration-hub

**Stack:**
Backend: NodeJS, Express, PostgreSQL
Frontend: React
Version Control: GitHub
Containerization: Docker
Deployment: Jelastic Cloud

**Main Flows:**
- OIDC Authentication as pre-requirement to use the application (Les Communs)
- Retrieving FDC-Tagged Products from DFC standardised Producer API
- Adjusting the desired pricing-markup (retail vs. wholesale unit pricing)
- Adding/Deleting/Updating FDC tagged Products in Shopify Store (automated updates in case details were changed by the producer)
- Managing Sales Sessions (automated weekly renewal of active Sales Sessions)
- Creating, Cancelling and completing Orders of FDC tagged Products

```
Frontend (React) <--> Backend (Express + NodeJS) <--> Database (PostgreSQL)
     ▲
     |
     ▼
Shopify API (graphQl) <--> Product & Order Management
     ▲
     |
     ▼
OIDC Authentication <--> Producer APIs (Products + Orders, DFC Standardized)
     ▲
     |
     ▼
Sales Session Management
```

### 3.Combined Technical Design Diagram
```
+-------------------------------+                    +-------------------------------+
|       Producer Store          |                    |            Hub Store          |
|                               |                    |                               |
| +---------------------------+ |                    | +---------------------------+ |
| |   Shopify Application     | |                    | |   Shopify Application     | |
| |   (NodeJS, React)         | |                    | |   (NodeJS, React)         | |
| |                           | |                    | |                           | |
| | - API Services            | |                    | | - API Services            | |
| |   (Orders, Products)      | |                    | |   (Orders, Products)      | |
| | - Database (PostgreSQL)   | |                    | | - Database (PostgreSQL)   | |
| +-----------+---------------+ |                    | +-----------+---------------+ |
|             |                 |                    |             |                 |
|             v                 |                    |             v                 |
+-------------|-----------------+                    +-------------|-----------------+
              |                                                    |
              |                                                    |
              |                                                    |
              |                                                    |
              +--------------------------------------------------------+
              |                       Communication                    |
              |                via Shopify API and DFC Connector       |
              +--------------------------------------------------------+
                ^                                    ^
                |                                    |
                |                                    |
                |                                    |
                |                                    |
                v                                    v
+-------------------------------+        +------------------------------+
| • Exporting FDC products      |        | • Authentication via OIDC    |
| • Processing wholesale orders |<------>| • Retrieving FDC products    |
|   via DFC ontology            |        |   from producers via DFC     |
|   standardisation             |        | • Communicating sales session|
| • Managing Hub user access    |        |   orders via DFC with        |
|   to endpoints                |        |   producer                   |
| • Synchronising internal      |        | • Receiving updates on       |
|   application and Shopify     |        |   product changes            |
|   states                      |        | • Managing internal excess   |
|                               |        |   stock                      |
+-------------------------------+        | • Synchronising internal     |
                                         |   application and Shopify    |
                                         |   states                     |
                                         +------------------------------+
```

### 4. Deployment process

```
+-------------------+       +------------------------+       +-------------------------+
|                   |       |                        |       |                         |
|  Shopify App      |       |  Docker Container for  |       |  Docker Container for   |
|   (NodeJs)        +------->    Application         |       |      Database           |
|                   |       |                        |       |                         |
+--------^----------+       +-----------^------------+       +-----------^-------------+
         |                          |                                 |
         |                          |                                 |
         |                          |                                 |
+--------+----------+       +-------+-------+               +---------+-----------+
|                   |       |               |               |                     |
|    GitHub         +------->   GitHub      +--------------->      Jelastic       |
|  (Source Code)    |       |   Actions     |  (Build and    |      Cloud         |
|                   |       |               |   Deploy)      |                    |
+-------------------+       +---------------+               +---------------------+
```
**Explanation:**

_Shopify App:_
This represents the Shopify application developed

_GitHub (Source Code):_
The source code of the Shopify application is maintained in a GitHub repository.

_GitHub Actions:_
A GitHub Actions workflow is configured to automate the build and deployment process.
When code is pushed to the repository, GitHub Actions will trigger a workflow to build the application and create Docker images for the application.

_Docker Containers:_
The application is containerized using Docker, creating an application container.
Similarly, the database is also containerized, creating a database container.

_Jelastic Cloud:_
The final stage involves deploying the Docker containers to the Jelastic Cloud.
GitHub Actions handles the deployment process, ensuring the latest version of the application and database are running in the cloud environment.

This pipeline ensures that any code changes pushed to the GitHub repository are automatically built, tested, and deployed to the Jelastic Cloud, providing a streamlined and efficient deployment process.

## Product Playbook

### Navigating the tool/website

Once the Hub and/or the Producer have installed their related apps, they will see them on Shopify in the left side panel in the “Apps” section.

The Hub needs to be authenticated against Les Communs to be able to use the custom built food-hub app.

### Key Features - Producer

**Hub Users**
Producers can manage access for reselling their products by approving or rejecting requests from potential resellers. They also have the ability to remove existing users from the reseller list.

**Products**
- A comprehensive list of all products currently in the Producer’s Shopify inventory, featuring checkboxes to enable or disable each product for the FDC Network.
- Each product can be mapped from a retail variant to a wholesale variant (e.g., Apple Balsamic Vinegar, Retail bottle, 100ml → Apple Balsamic Vinegar, Small case, 6x100ml).
- During the mapping process, Producers must specify the conversion ratio (e.g., 1 Small case = 6 Retail bottles).
- For every enabled product, the following details will be shared with the Hub: name, description, quantities, images, and variants.
- Note: There is a disable variant mapping mode which means that Producers can choose to map a variant to itself with a 1:1 ratio.

<img width="874" alt="Bildschirmfoto 2024-08-06 um 10 01 22" src="https://github.com/user-attachments/assets/95d58d91-1c4b-4dbe-a130-724d2dce2eb9">
<img width="821" alt="Bildschirmfoto 2024-08-06 um 10 01 12" src="https://github.com/user-attachments/assets/f3f26c51-7d38-4de1-b763-d1fc73550bcc">

For every enabled product, we will share its details with the Hub. Details include name, description, quantities, images and variants.


### Key Features - Hub

**Sales Sessions**
- Purpose: Sales Sessions are essential for Hubs to sell the Producer’s products on their store. They also signal to the system when all orders received by the Hub are finalized and ready for the Producer to process.
- Creation: Users must specify a start and end date when creating a Sales Session.
- Automatic Renewal: Once the Sales Session’s end date is reached, the session is automatically terminated, and a new session of equal length is created by the system.

<img width="304" alt="Bildschirmfoto 2024-08-06 um 10 03 45" src="https://github.com/user-attachments/assets/c7c51d4c-85f1-4a38-8421-0d631a30c619">

**Product List**
The Product List is the most important feature of the app. It includes only the products that the Producer has selected to be sold via the FDC Network.

<img width="892" alt="Bildschirmfoto 2024-08-06 um 10 05 44" src="https://github.com/user-attachments/assets/6f36763b-33ad-4b1d-b4fe-03c89250957e">

_On this page, Hub managers can:_
- Select which products they want to sell in their stores.
- Adjust the product price by applying a markup, which will be reflected in their store.
    - Note: Prices cannot be changed during an active Sales Session.
- View the number of configured variants for each product at a glance.

 <img width="888" alt="Bildschirmfoto 2024-08-06 um 10 04 46" src="https://github.com/user-attachments/assets/6c2bc777-d8c9-4b4f-b384-d24ff9b50cbe">

**Orders Flow between the Hub and the Producer**

The system follows a structured process for managing orders between the Hub and the Producer. The workflow is as follows:

_Initiating a Sales Session:_
At the start of a new Sales Session, the system generates an empty draft order on the Producer side. This draft order serves as a grouped order, ready to receive multiple line item updates.

_Updating the Draft Order:_
As sub-orders are received during the Sales Session, the system updates the draft order with the relevant line items. These updates can include adding new line items or canceling existing ones.

_Processing Internal Excess Stock:_
Before placing new orders with the Producer, the system first processes any available internal excess stock at the Hub. This ensures that existing inventory is utilized efficiently before additional orders are created.

_Completing the Sales Session:_
When the Sales Session concludes, the system finalizes the draft order. This completion moves the order to the Producer’s orders tab, marked as 'payment pending' and 'unfulfilled'. The Producer can then proceed with managing the fulfillment of the Sales Session order according to their procedures.


### Using the Tool

Here you can find some test scenarios to be performed in the indicated order, which will guide you through using the tool: https://docs.google.com/spreadsheets/d/1KwBg_uWBoqTWc7kjxfuR0Tw88OzeIYk3w8V1KtpoSS4/edit?usp=sharing

**Tips + best practices for using the tool**

When testing this for the first time, or if it’s required to have a clean slate, it’s very useful to follow these steps:

1. Hub manager:
    - End the active sales session (if applicable)
    - Clear all Shopify products (default Shopify functionality)
    - Log out from https://login.lescommuns.org/auth/realms/data-food-consortium/account/#/
3. Producer:
    - Delete Hub's user account
4. Hub manager:
    - Go to the food-hub app and login again with your OICD details

### External integrations
- OIDC integration with the server of Les Communs
- Sentry for error logging
- Shopify

### Creating a new environment

Due to the complexity of running the application on Jelastic, we have ended up a stack of multiple containers. Nginx, our application and Postgres.

Setting this up for the first time involved manual configuration changes, including nginx configuration and postgres ssl configuration.

The easiest way to create a new environment is to clone an existing environment in jelastic.

At the moment, the Nginx config for forwarded requests uses the application server's ip address. This does not update to the new IP address automatically.
You will need to edit conf.d/ssl.conf and change the proxy pass line to reflect the new ip address of the application container.
e.g: proxy_pass http://10.101.3.112:8081;

You will also need to change the environment variables of the application server where appropriate.
As a minimum, you will need to update the HOST environment variable to the external address of the server.

### Creating a new application

A quirk of shopify applications is that the shopify api key is baked into the distribution. A distribution cannot be used with multiple shopify applications.

This api key is referenced in the build via an environment variable. The current deployment pipeline uses github actions to build a new docker container with each commit to main. The value of this api key is provided by a Github Secret which is referenced in the github action workflow file.

## Glossary of Terms

*This glossary defines product-specific terminology to improve clarity and understanding.*

FDC Network = Food Data Collaboration Network, a network of producers, hubs & customers wishing to leverage a platform of short supply chain food distribution.

Hodmedods = Our test Producer.

Hub = Small producers or small stores that wish to re-sell products of local wholesale suppliers.

Producer = Local wholesale producers that wish to make their products available to the FDC Network.

Sales Session = A period of time (usually 1 week) during which the Hub gathers orders from their customers, which will be fulfilled at the end of that period.

Retail variant = A product variant which is sold individually at a retail price.

Retail price = The price of a Retail variant, that is the price of a product paid by the end consumer.

Trade variant = A product variant which is sold as a bundle of multiple Retail variants (bulk), making the price of one item lower than if it was sold at a Retail price.

Trade price = The price of the Trade variant, that is the price the Hub pays to the Producer if they order in bulk.
