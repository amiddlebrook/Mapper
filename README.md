# Mapper

**Map your world, one location at a time.**

Mapper is a fast, minimalist web application for organizing locations with URLs. Perfect for apartment hunting, job searches, travel planning, and research projects.

## What You Can Do

### 📍 Organize Locations
Add any location with a URL - apartment listings, job postings, parks, restaurants, or anything else. Each pin includes:
- The URL (automatically deduplicated)
- Physical address (geocoded to the map)
- Type (Housing, Job, Park, or Custom)
- Visual marker on an interactive map

### 🗺️ Multiple Maps
Create unlimited maps for different projects:
- Apartment Search 2026
- Job Opportunities - Bay Area
- Weekend Getaway Ideas
- Restaurant Wishlist

### 🔗 Share Your Maps
Make any map public to share with friends, family, or colleagues. They'll get a read-only view with all your pins and can explore the map without needing an account.

### 🎯 Stay Organized
- See all your pins on an interactive map
- Browse them in a synchronized list view
- Click any pin to center the map
- Delete pins you no longer need
- Never accidentally add the same URL twice

## How to Use

### Getting Started

1. **Sign In**
   Enter your email - no password required. We'll create your account or log you in automatically.

2. **Create Your First Map**
   Click "New Map" and give it a name. You can create as many maps as you need.

3. **Add Locations**
   Fill in the form at the top:
   - **URL**: Paste the link (e.g., apartment listing, job posting)
   - **Address**: Type the location (we'll find it on the map)
   - **Type**: Choose Housing, Job, Park, or create your own category

4. **View and Manage**
   - Your pins appear instantly on the map and in the list below
   - Click any pin or list item to focus the map
   - Delete pins you don't need anymore

### Sharing Maps

1. Select the map you want to share
2. Click "Share" in the top navigation
3. Make it public to get a shareable link
4. Send the link to anyone - they can view but not edit

## Features

- ⚡ **Lightning Fast** - Built on Cloudflare's global network
- 🎨 **Clean Interface** - Black background with light green accents, zero clutter
- 🚫 **No Duplicates** - Same URL can't be added twice to a map
- 🔒 **Private by Default** - Your maps are private unless you share them
- 📱 **Works Everywhere** - Responsive design works on desktop and mobile
- 🗺️ **Interactive Maps** - Powered by OpenStreetMap
- 💾 **Auto-Save** - Everything saves instantly

## Use Cases

**Apartment Hunting**
Track all your apartment listings in one place. See them on a map to understand neighborhoods and commute times.

**Job Search**
Map out job opportunities across the city. Compare locations and plan your applications strategically.

**Travel Planning**
Save hotels, restaurants, and attractions. Build the perfect itinerary with everything mapped out.

**Research Projects**
Organize locations for research, field work, or any project that involves physical places.

## Deployment

Mapper is deployed at **[list-mapper.com](https://list-mapper.com)** on Cloudflare Pages.

### Important Documentation

- **[DEPLOYMENT_FIX.md](./DEPLOYMENT_FIX.md)** - Fix deployment errors (read this first if deploys are failing)
- **[DOMAIN_SETUP.md](./DOMAIN_SETUP.md)** - Custom domain configuration guide

### Quick Deploy

```bash
# Deploy manually
npm run deploy

# Or use GitHub integration (recommended)
git push origin main  # Cloudflare auto-deploys
```

**Note**: This is a Cloudflare Pages project. Use `wrangler pages deploy`, not `wrangler deploy`.

## Support

Found a bug or have a suggestion? Open an issue on our [GitHub repository](https://github.com/North-Star-Apps/Mapper).

## Privacy

- Your email is only used for authentication
- Private maps are only visible to you
- Public maps don't expose your email
- We don't track or sell your data

---

Built with Cloudflare Pages, Workers, and D1.
