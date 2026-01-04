# 🚨 Quick Fix for Deployment Error

## The Error You're Seeing

```
✘ [ERROR] It looks like you've run a Workers-specific command in a Pages project.
  For Pages, please run `wrangler pages deploy` instead.
```

## The 5-Minute Fix

### Step 1: Go to Cloudflare Dashboard

1. Visit https://dash.cloudflare.com/
2. Click **Workers & Pages** in the left sidebar
3. Find and click on the **mapper** project
4. Click the **Settings** tab at the top

### Step 2: Fix Build Settings

1. Scroll down to **"Builds & deployments"** section
2. Click **"Configure settings"** or **"Edit settings"**
3. Make these changes:

   | Setting | Current (Wrong) | Fixed (Correct) |
   |---------|----------------|-----------------|
   | **Build command** | `npx wrangler deploy` | *(leave empty)* |
   | **Build output directory** | *(any)* | `public` |
   | **Root directory** | *(any)* | `/` |

4. Click **"Save"**

### Step 3: Retry Deployment

1. Go back to the **"Deployments"** tab
2. Click **"Retry deployment"** on the failed build
3. Or push a new commit to trigger a fresh deployment

### Step 4: Verify Success

Wait 1-2 minutes for the build to complete. You should see:
- ✅ Green checkmark on the deployment
- No errors in the build log
- Site is live at https://mapper.pages.dev

---

## Why This Happens

Cloudflare has two different products:

- **Workers**: Serverless functions → Use `wrangler deploy`
- **Pages**: Static sites with optional functions → Use `wrangler pages deploy` (or let Pages handle it automatically)

This project is a **Pages** project, but someone configured the dashboard to use the Workers deployment command. The dashboard settings override everything else, so this must be fixed in the dashboard.

---

## Still Having Issues?

1. **Run validation script**:
   ```bash
   ./validate-config.sh
   ```

2. **Check detailed guide**: See [DEPLOYMENT_FIX.md](./DEPLOYMENT_FIX.md) for comprehensive troubleshooting

3. **Manual deployment**:
   ```bash
   npm run deploy
   ```
   (Requires Cloudflare API token)

---

## Prevention

To avoid this in the future:

1. ✅ Use GitHub integration (automatic deployments on push)
2. ✅ Keep build command empty in dashboard
3. ✅ Let Cloudflare Pages handle deployment automatically
4. ❌ Don't manually configure build/deploy commands unless absolutely necessary
