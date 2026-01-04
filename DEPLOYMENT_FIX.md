# Fixing Cloudflare Pages Deployment

## Issue

The deployment is failing with this error:
```
✘ [ERROR] It looks like you've run a Workers-specific command in a Pages project.
  For Pages, please run `wrangler pages deploy` instead.
```

## Root Cause

The Cloudflare Pages project is configured to use `npx wrangler deploy` (which is for Cloudflare Workers) instead of the correct Pages deployment method.

## Solution

### Option 1: Fix Cloudflare Pages Build Settings (Recommended)

1. **Go to Cloudflare Dashboard**
   - Navigate to https://dash.cloudflare.com/
   - Select your account
   - Click "Workers & Pages" in the sidebar
   - Find and click on the "mapper" project

2. **Update Build Settings**
   - Click on "Settings" tab
   - Scroll to "Build & deployments" section
   - Click "Edit settings"

   Update the following:
   - **Build command**: Leave empty (or remove any existing command)
   - **Build output directory**: `public`
   - **Root directory**: `/` (default)

   **IMPORTANT**: Remove any custom deploy command if set. Cloudflare Pages handles deployment automatically when you push to your connected Git repository.

3. **Save Changes**
   - Click "Save"
   - Trigger a new deployment by pushing a commit or clicking "Retry deployment"

### Option 2: Deploy Manually from Command Line

If you need to deploy manually (not recommended for production):

```bash
# Use the npm script (recommended)
npm run deploy

# Or use wrangler directly
npx wrangler pages deploy public

# Make sure you're authenticated first
export CLOUDFLARE_API_TOKEN="your-api-token"
```

### Option 3: Use GitHub Integration (Best Practice)

The recommended approach is to use Cloudflare Pages' GitHub integration:

1. **Connect Repository**
   - In Cloudflare Pages dashboard, connect your GitHub repository
   - Cloudflare will automatically deploy when you push to your main branch

2. **Configure Branch Deployments**
   - Production branch: `main` (or your default branch)
   - Preview branches: All other branches (optional)

3. **Push Changes**
   ```bash
   git add .
   git commit -m "Your commit message"
   git push origin main
   ```

   Cloudflare Pages will automatically detect the push and deploy.

## Project Configuration

### Current Setup (Correct)

**package.json**:
```json
{
  "scripts": {
    "dev": "wrangler pages dev public --d1 DB=mapper_db --kv SESSIONS",
    "deploy": "wrangler pages deploy public",
    "db:migrate": "wrangler d1 execute mapper_db --file=./schema.sql"
  }
}
```

**wrangler.toml**:
```toml
name = "mapper"
compatibility_date = "2024-01-01"
pages_build_output_dir = "public"

[vars]
ENVIRONMENT = "production"

[[d1_databases]]
binding = "DB"
database_name = "mapper_db"
database_id = "f0324c27-590d-40fa-adbf-ca4704e99b33"

[[kv_namespaces]]
binding = "SESSIONS_MAPPER"
id = "b6312c0de1a847fea67a47d2242390cd"
```

### Project Structure

```
Mapper/
├── public/              # Pages build output directory
│   ├── _worker.js       # Cloudflare Pages Functions worker
│   ├── _routes.json     # Routes configuration
│   ├── app.js           # Application bundle
│   └── index.html       # Main HTML file
├── src/                 # Source files
├── wrangler.toml        # Cloudflare configuration
└── package.json         # NPM configuration
```

## Why This Happens

Cloudflare has two different deployment methods:

1. **Cloudflare Workers**: Standalone serverless functions
   - Deploy command: `wrangler deploy`
   - Uses `main` field in wrangler.toml
   - No static files

2. **Cloudflare Pages**: Static sites with optional Functions (our project)
   - Deploy command: `wrangler pages deploy <directory>`
   - Uses `pages_build_output_dir` in wrangler.toml
   - Includes static files and `_worker.js` for advanced mode

Our project is a **Pages project** (indicated by `pages_build_output_dir` in wrangler.toml and the `_worker.js` file), but the build settings were incorrectly set to use the Workers deploy command.

## Verification

After fixing the settings, verify the deployment:

1. **Check Deployment Status**
   - Go to Cloudflare Pages dashboard
   - View the latest deployment
   - Should show "Success" status

2. **Test the Application**
   ```bash
   # Test the deployed site
   curl -I https://mapper.pages.dev

   # Or visit in browser
   open https://mapper.pages.dev
   ```

3. **Test Custom Domain** (if configured)
   ```bash
   curl -I https://list-mapper.com
   ```

## Additional Resources

- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
- [Pages Functions (Advanced Mode)](https://developers.cloudflare.com/pages/functions/)
- [Wrangler Pages Commands](https://developers.cloudflare.com/workers/wrangler/commands/#pages)
- [Git Integration](https://developers.cloudflare.com/pages/configuration/git-integration/)

## Summary

**The key fix**: Update the Cloudflare Pages build settings in the dashboard to remove the custom deploy command, or ensure it's set to use `wrangler pages deploy public` instead of `wrangler deploy`.

For ongoing deployments, use the GitHub integration method where Cloudflare automatically deploys when you push to your repository.
