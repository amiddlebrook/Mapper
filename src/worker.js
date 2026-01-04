import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('/*', cors());

// Middleware to check authentication
const authenticate = async (c, next) => {
  const sessionId = c.req.header('X-Session-ID');

  if (!sessionId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const session = await c.env.DB.prepare(
    'SELECT user_id FROM sessions WHERE id = ? AND expires_at > ?'
  ).bind(sessionId, Math.floor(Date.now() / 1000)).first();

  if (!session) {
    return c.json({ error: 'Invalid or expired session' }, 401);
  }

  c.set('userId', session.user_id);
  await next();
};

// ============================================
// Authentication Routes
// ============================================

// Google OAuth - Start
app.get('/api/auth/google', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${new URL(c.req.url).origin}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent'
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// Google OAuth - Callback
app.get('/api/auth/google/callback', async (c) => {
  const code = c.req.query('code');
  const error = c.req.query('error');

  if (error || !code) {
    return c.redirect(`/?error=auth_failed&detail=${error || 'no_code'}`);
  }

  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return c.redirect('/?error=missing_credentials');
  }

  const redirectUri = `${new URL(c.req.url).origin}/api/auth/google/callback`;

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      return c.redirect(`/?error=token_error&detail=${tokens.error}`);
    }

    if (!tokens.access_token) {
      return c.redirect('/?error=no_access_token');
    }

    // Get user info
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    const userInfo = await userInfoResponse.json();
    const email = userInfo.email;

    if (!email) {
      return c.redirect('/?error=no_email');
    }

    // Get or create user
    let user = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email).first();

    if (!user) {
      const userId = crypto.randomUUID();
      await c.env.DB.prepare(
        'INSERT INTO users (id, email) VALUES (?, ?)'
      ).bind(userId, email).run();
      user = { id: userId };
    }

    // Create session (30 days)
    const sessionId = crypto.randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);

    await c.env.DB.prepare(
      'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
    ).bind(sessionId, user.id, expiresAt).run();

    // Redirect back to app with session
    return c.redirect(`/?session=${sessionId}`);

  } catch (err) {
    console.error('OAuth error:', err);
    return c.redirect(`/?error=oauth_exception&detail=${encodeURIComponent(err.message)}`);
  }
});

// Simple email-based login (magic link simulation)
app.post('/api/auth/login', async (c) => {
  const { email } = await c.req.json();

  if (!email || !email.includes('@')) {
    return c.json({ error: 'Invalid email' }, 400);
  }

  // Get or create user
  let user = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).first();

  if (!user) {
    const userId = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO users (id, email) VALUES (?, ?)'
    ).bind(userId, email).run();
    user = { id: userId };
  }

  // Create session (30 days)
  const sessionId = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);

  await c.env.DB.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionId, user.id, expiresAt).run();

  return c.json({
    sessionId,
    userId: user.id,
    email
  });
});

app.post('/api/auth/logout', authenticate, async (c) => {
  const sessionId = c.req.header('X-Session-ID');

  await c.env.DB.prepare(
    'DELETE FROM sessions WHERE id = ?'
  ).bind(sessionId).run();

  return c.json({ success: true });
});

app.get('/api/auth/me', authenticate, async (c) => {
  const userId = c.get('userId');

  const user = await c.env.DB.prepare(
    'SELECT id, email FROM users WHERE id = ?'
  ).bind(userId).first();

  return c.json(user);
});

// ============================================
// Maps Routes
// ============================================

app.get('/api/maps', authenticate, async (c) => {
  const userId = c.get('userId');

  const maps = await c.env.DB.prepare(
    'SELECT id, name, description, is_public, created_at FROM maps WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all();

  if (maps.results.length === 0) {
    // Auto-create default map
    const mapId = crypto.randomUUID();
    const name = 'My List Map';

    await c.env.DB.prepare(
      'INSERT INTO maps (id, user_id, name, is_public) VALUES (?, ?, ?, 0)'
    ).bind(mapId, userId, name).run();

    return c.json([{
      id: mapId,
      name,
      description: null,
      is_public: 0,
      created_at: Math.floor(Date.now() / 1000)
    }]);
  }

  return c.json(maps.results);
});

app.post('/api/maps', authenticate, async (c) => {
  const userId = c.get('userId');
  const { name, description, is_public } = await c.req.json();

  if (!name) {
    return c.json({ error: 'Name is required' }, 400);
  }

  const mapId = crypto.randomUUID();

  await c.env.DB.prepare(
    'INSERT INTO maps (id, user_id, name, description, is_public) VALUES (?, ?, ?, ?, ?)'
  ).bind(mapId, userId, name, description || null, is_public ? 1 : 0).run();

  return c.json({
    id: mapId,
    name,
    description,
    is_public: is_public ? 1 : 0
  });
});

app.get('/api/maps/:id', async (c) => {
  const mapId = c.params.id;
  const sessionId = c.req.header('X-Session-ID');

  const map = await c.env.DB.prepare(
    'SELECT id, user_id, name, description, is_public FROM maps WHERE id = ?'
  ).bind(mapId).first();

  if (!map) {
    return c.json({ error: 'Map not found' }, 404);
  }

  // Check permissions
  if (!map.is_public) {
    if (!sessionId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const session = await c.env.DB.prepare(
      'SELECT user_id FROM sessions WHERE id = ? AND expires_at > ?'
    ).bind(sessionId, Math.floor(Date.now() / 1000)).first();

    if (!session || session.user_id !== map.user_id) {
      return c.json({ error: 'Forbidden' }, 403);
    }
  }

  return c.json(map);
});

app.put('/api/maps/:id', authenticate, async (c) => {
  const userId = c.get('userId');
  const mapId = c.params.id;
  const { name, description, is_public } = await c.req.json();

  // Verify ownership
  const map = await c.env.DB.prepare(
    'SELECT user_id FROM maps WHERE id = ?'
  ).bind(mapId).first();

  if (!map || map.user_id !== userId) {
    return c.json({ error: 'Map not found or unauthorized' }, 403);
  }

  await c.env.DB.prepare(
    'UPDATE maps SET name = ?, description = ?, is_public = ? WHERE id = ?'
  ).bind(name, description || null, is_public ? 1 : 0, mapId).run();

  return c.json({ success: true });
});

app.delete('/api/maps/:id', authenticate, async (c) => {
  const userId = c.get('userId');
  const mapId = c.params.id;

  const map = await c.env.DB.prepare(
    'SELECT user_id FROM maps WHERE id = ?'
  ).bind(mapId).first();

  if (!map || map.user_id !== userId) {
    return c.json({ error: 'Map not found or unauthorized' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM maps WHERE id = ?').bind(mapId).run();

  return c.json({ success: true });
});

// ============================================
// Pins Routes
// ============================================

app.get('/api/maps/:mapId/pins', async (c) => {
  const mapId = c.params.mapId;
  const sessionId = c.req.header('X-Session-ID');

  // Check map permissions
  const map = await c.env.DB.prepare(
    'SELECT user_id, is_public FROM maps WHERE id = ?'
  ).bind(mapId).first();

  if (!map) {
    return c.json({ error: 'Map not found' }, 404);
  }

  if (!map.is_public) {
    if (!sessionId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const session = await c.env.DB.prepare(
      'SELECT user_id FROM sessions WHERE id = ? AND expires_at > ?'
    ).bind(sessionId, Math.floor(Date.now() / 1000)).first();

    if (!session || session.user_id !== map.user_id) {
      return c.json({ error: 'Forbidden' }, 403);
    }
  }

  const pins = await c.env.DB.prepare(
    'SELECT id, url, address, lat, lng, type, custom_type, created_at FROM pins WHERE map_id = ? ORDER BY created_at DESC'
  ).bind(mapId).all();

  return c.json(pins.results || []);
});

app.post('/api/maps/:mapId/pins', authenticate, async (c) => {
  const userId = c.get('userId');
  const mapId = c.params.mapId;
  const { url, address, lat, lng, type, custom_type } = await c.req.json();

  // Verify ownership
  const map = await c.env.DB.prepare(
    'SELECT user_id FROM maps WHERE id = ?'
  ).bind(mapId).first();

  if (!map || map.user_id !== userId) {
    return c.json({ error: 'Map not found or unauthorized' }, 403);
  }

  // Validate required fields
  if (!url || !address || lat === undefined || lng === undefined || !type) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  // Validate type
  const validTypes = ['Housing', 'Job', 'Park', 'Custom'];
  if (!validTypes.includes(type)) {
    return c.json({ error: 'Invalid type' }, 400);
  }

  // Normalize URL
  const normalizedUrl = normalizeUrl(url);

  // Check for duplicate URL
  const existing = await c.env.DB.prepare(
    'SELECT id FROM pins WHERE map_id = ? AND url = ?'
  ).bind(mapId, normalizedUrl).first();

  if (existing) {
    return c.json({ error: 'This URL has already been added to this map' }, 409);
  }

  const pinId = crypto.randomUUID();

  await c.env.DB.prepare(
    'INSERT INTO pins (id, map_id, url, address, lat, lng, type, custom_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(pinId, mapId, normalizedUrl, address, lat, lng, type, custom_type || null).run();

  return c.json({
    id: pinId,
    url: normalizedUrl,
    address,
    lat,
    lng,
    type,
    custom_type
  });
});

app.delete('/api/maps/:mapId/pins/:pinId', authenticate, async (c) => {
  const userId = c.get('userId');
  const mapId = c.params.mapId;
  const pinId = c.params.pinId;

  // Verify ownership
  const map = await c.env.DB.prepare(
    'SELECT user_id FROM maps WHERE id = ?'
  ).bind(mapId).first();

  if (!map || map.user_id !== userId) {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  await c.env.DB.prepare(
    'DELETE FROM pins WHERE id = ? AND map_id = ?'
  ).bind(pinId, mapId).run();

  return c.json({ success: true });
});

// ============================================
// Geocoding Proxy
// ============================================

app.get('/api/geocode', authenticate, async (c) => {
  const address = c.req.query('address');

  if (!address) {
    return c.json({ error: 'Address is required' }, 400);
  }

  // Using OpenStreetMap Nominatim (free, no API key required)
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mapper/1.0'
    }
  });

  const data = await response.json();

  if (!data || data.length === 0) {
    return c.json({ error: 'Address not found' }, 404);
  }

  const result = data[0];

  return c.json({
    address: result.display_name,
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon)
  });
});

// ============================================
// Utility Functions
// ============================================

function normalizeUrl(url) {
  let normalized = url.trim();

  // Remove protocol
  normalized = normalized.replace(/^https?:\/\//, '');

  // Remove trailing slash
  normalized = normalized.replace(/\/$/, '');

  // Remove www.
  normalized = normalized.replace(/^www\./, '');

  return normalized.toLowerCase();
}

export default {
  fetch: app.fetch
};
