# Deployment Strategy for Jelastic Environments

The application is stored on https://app.jpe.infomaniak.com/ and consists of various parts as described below:

## 1. PRODUCTION Environment Setup

### Application Server (Docker container)
Runs the application and is connected to Shopify via the Application Dashboard (API Configuration Section)

**Automated Deployments:**
- Image Building: Docker images are built automatically via GitHub Actions. The build process triggers on code changes and commits.
- Deployment Notification: GitHub Actions will ping Jelastic via a REST API call with deployment details once the build is complete.
- Tagging: Use branch-sha_commit tags (e.g., main-2d478ef) to keep track of versions.

**Logs:** 
- Access logs in the run.log file within the Docker container for troubleshooting.
  
**Environment Variables:**
- Configure necessary environment variables using the Variables popup in Jelastic.

### Nginx Load Balancer:

- Port Configuration: Configure Nginx to listen on relevant application port (HTTP) and proxy traffic to the appropriate internal nodes based on IP addresses via HTTPS.
- SSL Configuration:
  - Ensure Nginx is set up to handle SSL communication internally.
  - Use the ssl.conf configuration file to set up SSL keys for secure communication between components.

### Postgres Container:
Stores the internal data store 
- Links: Ensure proper linking between the Postgres container and other components.
- Certificates: Use certificates to secure communication between the Postgres container and other services.

### Creating new Environments:
- Simplest way is to clone Environment by using the Jelastic environment cloning feature to duplicate the current setup.
- This will create an exact replica of your existing environment.
- Post-clone, adjust the following settings:
  - Update environment-specific settings, such as IP addresses, secrets, and environment variables.
  - Ensure any environment-specific configurations (e.g., database URLs, API keys) are updated.
  
![Bildschirmfoto 2024-09-05 um 13 27 29](https://github.com/user-attachments/assets/eadf8d6a-44e8-45f6-96f5-60ae5aeb2cf9)

## 2. DFC trusted audiences (hub-issued tokens)

DFC routes reject tokens whose `aud` doesn't include our `OIDC_CLIENT_ID` (403 audience mismatch). Hubs calling with their own client tokens (e.g. `azp: proto-dfc`, `aud: account`) need allowlisting. Code: `web/middleware/checkUserAccessPermissions.js:getAcceptedAudiences()`.

- **Required: Keycloak audience mapper.** Keycloak's introspection endpoint returns `active:false` unless the authenticating client is in the token's `aud` (upstream audience check, see keycloak/keycloak#49794). So add an audience mapper on the hub client adding our clientId to `aud`. Without this, the token never reaches user lookup no matter what the env var says.
- **Add**: append the hub audience to `OIDC_TRUSTED_AUDIENCES` in `web/.env` (comma-separated, e.g. `account,proto-dfc`), restart. This only improves the 403 diagnostic (names the accepted set instead of crying mismatch); it does not grant access by itself.
- **Remove**: delete the entry, restart. Diagnostic reverts to strict mismatch wording.
- **Amend**: edit the list in place, restart. Empty/unset = strict legacy (only `OIDC_CLIENT_ID`).
- **Verify** (with `LOG_AUTH_DIAGNOSTICS=1`, mapper applied): browser-token curl should progress `Audience mismatch` → `User not found in database` (first call auto-provisions `status=false`) → approve the `users` row → 200 with `@graph`. The middle 403 is expected, not a bug. If it stays on audience mismatch after the mapper, the mapper isn't on the token — decode the JWT payload and check `aud` before touching code.
- **Rollback**: unset the var and/or remove the mapper, restart.
