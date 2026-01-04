# Custom Domain Setup for Mapper

## Domain: list-mapper.com

This document outlines the steps to configure and verify your custom domain for the Mapper application.

## Prerequisites ✓

- [x] Custom domain `list-mapper.com` added in Cloudflare
- [x] Application code uses relative URLs (automatically works with custom domain)
- [x] Cloudflare Pages project deployed

## Configuration Steps

### 1. Cloudflare Dashboard Setup

Since you've already added `list-mapper.com` as a custom domain in Cloudflare, verify the following:

1. **Navigate to Cloudflare Pages**
   - Go to: https://dash.cloudflare.com/
   - Select your account
   - Click "Workers & Pages" in the sidebar
   - Find and click on the "mapper" project

2. **Custom Domains Section**
   - Click on the "Custom domains" tab
   - Verify `list-mapper.com` is listed
   - Check that the status shows "Active" (may take a few minutes)
   - Optionally add `www.list-mapper.com` as well

3. **DNS Configuration**
   - The DNS should be automatically configured by Cloudflare
   - Verify that your domain has a CNAME record pointing to your Pages project:
     - Type: `CNAME`
     - Name: `@` (or `list-mapper.com`)
     - Target: `mapper.pages.dev` (or similar)
     - Proxied: Yes (orange cloud)

### 2. SSL/TLS Configuration

1. In Cloudflare Dashboard, go to SSL/TLS settings
2. Ensure SSL/TLS encryption mode is set to **"Full"** or **"Full (strict)"**
3. Verify that Universal SSL certificate is active

### 3. Application Configuration

The application is already configured to work with custom domains:

- **API Base URL**: Uses `window.location.origin` (automatically adapts to the domain)
- **Share URLs**: Dynamically generated using `window.location.origin`
- **No hardcoded URLs**: All endpoints are relative

No code changes are required! ✓

### 4. Deployment

To deploy the latest version:

```bash
# Make sure you're authenticated with Cloudflare
export CLOUDFLARE_API_TOKEN="your-api-token"

# Deploy to Pages
npm run deploy
```

Or deploy via GitHub integration (recommended):
- Push changes to your repository
- Cloudflare Pages will automatically deploy

### 5. Verification Steps

After the domain is active, verify the setup:

1. **Test Domain Access**
   ```bash
   curl -I https://list-mapper.com
   ```
   Should return `200 OK` with proper SSL certificate

2. **Test Application Functionality**
   - Visit https://list-mapper.com
   - Create an account / login
   - Create a new map
   - Add a pin
   - Test sharing functionality
   - Verify API calls work correctly

3. **Test WWW Redirect** (if configured)
   - Visit https://www.list-mapper.com
   - Should redirect to https://list-mapper.com

4. **Test SSL Certificate**
   - Visit https://list-mapper.com
   - Check that the browser shows a valid SSL certificate
   - Ensure there are no mixed content warnings

### 6. DNS Propagation

DNS changes can take up to 48 hours to propagate globally, but typically take effect within a few minutes to a few hours.

Check propagation status:
- https://dnschecker.org/ (enter `list-mapper.com`)
- https://www.whatsmydns.net/ (enter `list-mapper.com`)

## Troubleshooting

### Domain Not Accessible

1. **Check DNS Propagation**
   - Use https://dnschecker.org/
   - Wait up to 48 hours for full propagation

2. **Verify Cloudflare Configuration**
   - Check that domain is "Active" in Pages custom domains
   - Verify DNS records are proxied (orange cloud)

3. **Check SSL Certificate**
   - Go to SSL/TLS → Edge Certificates in Cloudflare
   - Verify Universal SSL is enabled
   - Wait a few minutes if recently added

### API Calls Failing

1. **Check CORS Settings**
   - The worker already has CORS enabled via Hono middleware
   - No additional configuration needed

2. **Verify Database Bindings**
   - D1 database binding: `DB`
   - KV namespace binding: `SESSIONS_MAPPER`
   - Both are configured in `wrangler.toml`

### Mixed Content Warnings

- Ensure all resources are loaded via HTTPS
- Check that external scripts (Leaflet, etc.) use HTTPS URLs
- Current configuration already uses HTTPS for all external resources ✓

## Current Configuration

### wrangler.toml
```toml
name = "mapper"
main = "src/worker.js"

[vars]
ENVIRONMENT = "production"

[[d1_databases]]
binding = "DB"
database_name = "mapper_db"
database_id = "f0324c27-590d-40fa-adbf-ca4704e99b33"

[[kv_namespaces]]
binding = "SESSIONS_MAPPER"
id = "b6312c0de1a847fea67a47d2242390cd"

[[pages]]
project_name = "mapper"
```

### Deployment Commands
```bash
# Development
npm run dev

# Deploy to Cloudflare Pages
npm run deploy

# Database migrations
npm run db:migrate
```

## Next Steps

1. ✓ Custom domain added to Cloudflare
2. ✓ Application code reviewed (no changes needed)
3. ⏳ Wait for DNS propagation (if just added)
4. ⏳ Deploy latest version (if needed)
5. ⏳ Test domain access and functionality
6. ⏳ Monitor for any issues

## Support

- **Cloudflare Pages Docs**: https://developers.cloudflare.com/pages/
- **Custom Domains Guide**: https://developers.cloudflare.com/pages/platform/custom-domains/
- **Cloudflare Community**: https://community.cloudflare.com/

## Notes

- The application is fully compatible with custom domains
- No code changes are required
- All URLs are dynamically generated based on the current domain
- SSL is automatically handled by Cloudflare
- The domain will work for both regular access and shared public maps
