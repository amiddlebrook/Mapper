# Mapper

**Every place has a story.** A private, shareable place-collection application built entirely with Cloudflare Workers + static assets + D1. No subscription, payment processor, hosting VM, paid map API, or app account required.

## Features

- Multiple maps with names, descriptions, private/public visibility, and read-only share links.
- Add destinations by clicking the map or looking up an address. Supports housing, jobs, parks, or custom categories.
- Search, category filters, location focus, delete, CSV export, mobile layout.
- Secure, no-email workspace with a generated recovery key. The key can restore a workspace on another device.
- Optional **Google sign-in** preserves access to existing Google-linked Mapper accounts (requires free Google OAuth credentials).
- Data lives in **Cloudflare D1**. Static frontend + backend are deployed together as one **Cloudflare Worker**.
- GitHub Actions runs tests and deploys on changes to `main`.

## Architecture

```
Browser (Leaflet + OpenStreetMap tiles)
     ↓ same-origin HTTPS
Cloudflare Worker /api/* ── Cloudflare D1
     └── Static Assets (public/)
     └── Geocoding cache + one-request-per-two-seconds global throttle
            └── OpenStreetMap Nominatim (low-volume use only)
GitHub → Actions: test → D1 additive schema → wrangler deploy
```

Only the Cloudflare and GitHub **free plans** are required, within their respective free-tier quotas. Tiles/geocoding are from community-operated OpenStreetMap services, whose usage policies must be respected; do not use them for high-volume commercial geocoding. Manual map-click pinning requires no geocoder.

## First deployment

1. Use a free Cloudflare account with Workers and D1 enabled. Keep the existing D1 ID in `wrangler.toml` **if deploying to the original Cloudflare account**. For a different account, first create a D1 database `mapper_db` using `npx wrangler d1 create mapper_db`, then update `database_id` to its ID.
2. In the GitHub repository **Settings → Secrets and variables → Actions**, configure `CLOUDFLARE_API_TOKEN` (Cloudflare API token with Workers Scripts Edit and D1 Edit permissions on your account) and `CLOUDFLARE_ACCOUNT_ID`. Do not commit these values.
3. Push/merge into `main`. The workflow tests the app, applies `schema.sql` idempotently to the existing D1 database (no `DROP` statements), and deploys the Worker + assets to `mapper.<your-workers-subdomain>.workers.dev`.
4. If you want to continue using `list-mapper.com`, add it as a **Worker Custom Domain** under Cloudflare Workers & Pages → `mapper` → Settings → Domains & Routes. A Workers deploy does not automatically move a prior Pages custom domain.
5. Visit the URL, click **Create free workspace**, and save the shown recovery key. Without the recovery key (or a still-active browser session), a workspace cannot be recovered. Sharing a map is optional and disabled by default.

**Optional Google OAuth:** Set Worker secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` through Wrangler (`npx wrangler secret put ...`), and configure Google OAuth redirect to `https://<your-domain>/api/auth/google/callback`. These secrets are only needed for Google sign-in, not guest workspaces. Do not use the old unauthenticated email-login endpoint: it has been removed.

## Local development

```bash
npm install
npm run db:local
npm run dev
```

Run tests: `npm run check && npm test`.

To deploy manually (after `wrangler login` and configuring the D1 binding):

```bash
npm run db:remote
npm run deploy
```

## Privacy and security

- The former open `/api/auth/login` endpoint, which issued sessions for arbitrary emails, has been removed.
- Sessions use HttpOnly, SameSite cookies; random session values are hashed before D1 storage, with request Origin checked on mutations.
- New no-email accounts use a random 192-bit recovery key; only its SHA-256 digest is used for database lookup. The raw key is returned once at creation.
- Google OAuth verifies `state` and the user's verified email and never includes session tokens in redirect URLs.
- Public sharing only exposes map and pin data; private map reads and all write operations enforce ownership.
- Untrusted place names and URLs are rendered as DOM text rather than inserted as HTML; submitted web addresses require `http(s)`.
- D1 tables are retained, including the existing users, maps, pins and sessions. New geocoding tables are added without destructive migration.

## Limitations

- Free plans have rate/usage limits (Workers, D1, GitHub Actions); no unlimited hosting can honestly be guaranteed at $0.
- OpenStreetMap tile/geocoding servers are community resources, not an SLA-backed commercial service. Global Nominatim lookup throttling and caching are built in.
- A recovery key is only available at initial creation and must be saved. There is no email-based password reset.
- Google OAuth login requires separately configured free Google credentials. Existing Google-linked accounts remain stored, but older sessions no longer work after this security migration.

Built for [amiddlebrook/Mapper](https://github.com/amiddlebrook/Mapper).
