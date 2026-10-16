const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const SESSION_COOKIE = 'mapper_session';
const oneDay = 86400;
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
const fail = (message, status = 400) => json({ error: message }, status);
const now = () => Math.floor(Date.now() / 1000);
const cookie = (request, name) => (request.headers.get('Cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1) || '';
const sha256 = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const sessionCookie = (value, request, maxAge = 30 * oneDay) => `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
const originOk = (request) => { const origin = request.headers.get('Origin'); return !!origin && origin === new URL(request.url).origin; };
const isOwner = (map, user) => !!map && !!user && map.user_id === user.id;
const string = (value, max = 300) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const canRead = (map, user) => !!map && (map.is_public === 1 || isOwner(map, user));

async function userFromRequest(request, env) {
  const token = cookie(request, SESSION_COOKIE);
  if (!/^[a-f\d-]{36}$/i.test(token)) return null;
  const digest = await sha256(token);
  return await env.DB.prepare('SELECT users.id, users.email FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.id = ? AND sessions.expires_at > ?').bind(digest, now()).first();
}
async function openSession(request, env, userId) {
  const token = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), userId, now() + 30 * oneDay).run();
  return sessionCookie(token, request);
}
function publicUser(user) { return user ? { id: user.id, email: user.email.endsWith('@mapper.invalid') ? null : user.email } : null; }
async function readBody(request) {
  if (Number(request.headers.get('content-length') || 0) > 12000) throw new Error('Request too large');
  try { return await request.json(); } catch { throw new Error('Invalid JSON'); }
}
function normalizeUrl(raw) {
  const input = string(raw, 2048);
  if (!input) throw new Error('URL is required');
  const u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (!['https:', 'http:'].includes(u.protocol) || !u.hostname.includes('.')) throw new Error('Only public http(s) URLs are supported');
  if (u.username || u.password) throw new Error('URLs cannot include credentials');
  u.hash = '';
  u.hostname = u.hostname.replace(/^www\./, '');
  if (u.pathname === '/') u.pathname = '';
  return u.toString().replace(/\/$/, '');
}
function validCoordinates(lat, lng) { return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180; }
async function mapFor(env, id) { return await env.DB.prepare('SELECT id, user_id, name, description, is_public, created_at FROM maps WHERE id = ?').bind(id).first(); }
async function getPins(env, id) { const result = await env.DB.prepare('SELECT id, url, address, lat, lng, type, custom_type, created_at FROM pins WHERE map_id = ? ORDER BY created_at DESC, id DESC LIMIT 2000').bind(id).all(); return result.results || []; }
async function getMaps(env, user) { const result = await env.DB.prepare('SELECT id, name, description, is_public, created_at FROM maps WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100').bind(user.id).all(); return result.results || []; }

async function api(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD' && !originOk(request)) return fail('Invalid request origin', 403);
  if (path === '/api/health' && method === 'GET') return json({ status: 'ok', service: 'mapper', storage: 'd1' });
  if (!env.DB) return fail('D1 database is not configured', 503);
  const user = await userFromRequest(request, env);
  if (path === '/api/session' && method === 'GET') return json({ user: publicUser(user) }, user ? 200 : 401);
  if (path === '/api/session/guest' && method === 'POST') {
    if (user) return json({ user: publicUser(user) });
    const recoveryKey = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
    const id = crypto.randomUUID();
    const email = `key-${await sha256(recoveryKey)}@mapper.invalid`;
    await env.DB.prepare('INSERT INTO users (id, email) VALUES (?, ?)').bind(id, email).run();
    const setCookie = await openSession(request, env, id);
    return json({ user: { id, email: null }, recoveryKey }, 201, { 'Set-Cookie': setCookie });
  }
  if (path === '/api/session/recover' && method === 'POST') {
    const body = await readBody(request);
    const key = string(body.key, 100);
    if (!/^[a-f\d]{48}$/i.test(key)) return fail('Invalid recovery key', 400);
    const match = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(`key-${await sha256(key.toLowerCase())}@mapper.invalid`).first();
    if (!match) return fail('Recovery key not found', 401);
    const setCookie = await openSession(request, env, match.id);
    return json({ user: { id: match.id, email: null } }, 200, { 'Set-Cookie': setCookie });
  }
  if (path === '/api/session/logout' && method === 'POST') {
    const token = cookie(request, SESSION_COOKIE);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', request, 0) });
  }
  if (path === '/api/auth/google' && method === 'GET') {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return fail('Google login is not configured; create a free workspace instead.', 503);
    const state = crypto.randomUUID();
    const params = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${url.origin}/api/auth/google/callback`, response_type: 'code', scope: 'openid email', state, prompt: 'select_account' });
    const stateCookie = `mapper_oauth_state=${state}; Path=/api/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=600${url.protocol === 'https:' ? '; Secure' : ''}`;
    return new Response(null, { status: 302, headers: { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, 'Set-Cookie': stateCookie, 'Cache-Control': 'no-store' } });
  }
  if (path === '/api/auth/google/callback' && method === 'GET') {
    if (!url.searchParams.get('code') || !/^[a-f\d-]{36}$/i.test(cookie(request, 'mapper_oauth_state')) || url.searchParams.get('state') !== cookie(request, 'mapper_oauth_state')) return Response.redirect(`${url.origin}/?error=oauth`, 302);
    const exchange = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, code: url.searchParams.get('code'), grant_type: 'authorization_code', redirect_uri: `${url.origin}/api/auth/google/callback` }) });
    if (!exchange.ok) return Response.redirect(`${url.origin}/?error=oauth`, 302);
    const tokens = await exchange.json();
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!profileResponse.ok) return Response.redirect(`${url.origin}/?error=oauth`, 302);
    const profile = await profileResponse.json();
    if (!profile.email_verified || !profile.email) return Response.redirect(`${url.origin}/?error=unverified`, 302);
    const email = profile.email.toLowerCase();
    let account = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (!account) {
      const id = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO users (id, email) VALUES (?, ?) ON CONFLICT(email) DO NOTHING').bind(id, email).run();
      account = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    }
    const setCookie = await openSession(request, env, account.id);
    const headers = new Headers({ Location: url.origin, 'Cache-Control': 'no-store', 'Set-Cookie': setCookie });
    headers.append('Set-Cookie', `mapper_oauth_state=; Path=/api/auth/google/callback; HttpOnly; Max-Age=0${url.protocol === 'https:' ? '; Secure' : ''}`);
    return new Response(null, { status: 302, headers });
  }
  if (!user && method !== 'GET') return fail('Sign in or create a free workspace to continue', 401);
  if (path === '/api/maps' && method === 'GET') {
    if (!user) return fail('Authentication required', 401);
    return json(await getMaps(env, user));
  }
  if (path === '/api/maps' && method === 'POST') {
    const body = await readBody(request);
    const name = string(body.name, 80);
    if (!name) return fail('Map name is required');
    const id = crypto.randomUUID();
    const description = string(body.description, 300);
    await env.DB.prepare('INSERT INTO maps (id, user_id, name, description, is_public) VALUES (?, ?, ?, ?, ?)').bind(id, user.id, name, description, body.is_public ? 1 : 0).run();
    return json({ id, name, description, is_public: body.is_public ? 1 : 0 }, 201);
  }
  const mapRoute = path.match(/^\/api\/maps\/([0-9a-f-]{36})$/i);
  if (mapRoute) {
    const map = await mapFor(env, mapRoute[1]);
    if (!map) return fail('Map not found', 404);
    if (method === 'GET') {
      if (!canRead(map, user)) return fail('Map is private', 403);
      return json({ id: map.id, name: map.name, description: map.description, is_public: map.is_public, is_owner: isOwner(map, user) });
    }
    if (!isOwner(map, user)) return fail('Map not found', 404);
    if (method === 'DELETE') { await env.DB.prepare('DELETE FROM maps WHERE id = ? AND user_id = ?').bind(map.id, user.id).run(); return json({ ok: true }); }
    if (method === 'PATCH' || method === 'PUT') {
      const body = await readBody(request);
      const name = string(body.name ?? map.name, 80);
      if (!name) return fail('Map name is required');
      const description = string(body.description ?? map.description, 300);
      const visible = body.is_public === undefined ? map.is_public : (body.is_public ? 1 : 0);
      await env.DB.prepare('UPDATE maps SET name = ?, description = ?, is_public = ? WHERE id = ? AND user_id = ?').bind(name, description, visible, map.id, user.id).run();
      return json({ id: map.id, name, description, is_public: visible });
    }
  }
  const pinRoute = path.match(/^\/api\/maps\/([0-9a-f-]{36})\/pins(?:\/([0-9a-f-]{36}))?$/i);
  if (pinRoute) {
    const map = await mapFor(env, pinRoute[1]);
    if (!map) return fail('Map not found', 404);
    if (!pinRoute[2] && method === 'GET') {
      if (!canRead(map, user)) return fail('Map is private', 403);
      return json(await getPins(env, map.id));
    }
    if (!isOwner(map, user)) return fail('Map not found', 404);
    if (pinRoute[2] && method === 'DELETE') {
      await env.DB.prepare('DELETE FROM pins WHERE id = ? AND map_id = ?').bind(pinRoute[2], map.id).run();
      return json({ ok: true });
    }
    if (!pinRoute[2] && method === 'POST') {
      const body = await readBody(request);
      const lat = Number(body.lat), lng = Number(body.lng);
      if (!validCoordinates(lat, lng)) return fail('Valid latitude and longitude are required');
      const address = string(body.address, 300);
      if (!address) return fail('Location name or address is required');
      const type = string(body.type, 16);
      if (!['Housing', 'Job', 'Park', 'Custom'].includes(type)) return fail('Invalid category');
      const customType = type === 'Custom' ? string(body.custom_type, 50) : '';
      if (type === 'Custom' && !customType) return fail('Custom category is required');
      let pinUrl;
      try { pinUrl = normalizeUrl(body.url || `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}`); } catch { return fail('Invalid URL'); }
      const id = crypto.randomUUID();
      try {
        await env.DB.prepare('INSERT INTO pins (id, map_id, url, address, lat, lng, type, custom_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, map.id, pinUrl, address, lat, lng, type, customType || null).run();
      } catch (e) { if (String(e).includes('UNIQUE')) return fail('This URL is already on this map', 409); throw e; }
      return json({ id, url: pinUrl, address, lat, lng, type, custom_type: customType }, 201);
    }
  }
  if (path === '/api/geocode' && method === 'GET') {
    if (!user) return fail('Authentication required', 401);
    const address = string(url.searchParams.get('address'), 250);
    if (address.length < 3) return fail('Enter a more specific address');
    const key = address.toLowerCase().replace(/\s+/g, ' ');
    const cached = await env.DB.prepare('SELECT payload FROM geocode_cache WHERE query = ?').bind(key).first();
    if (cached) return json(JSON.parse(cached.payload));
    const second = now();
    const permit = await env.DB.prepare("INSERT INTO service_throttle (service, next_at) VALUES ('nominatim', ?) ON CONFLICT(service) DO UPDATE SET next_at = excluded.next_at WHERE next_at <= ?").bind(second + 2, second).run();
    if (!permit.meta?.changes) return fail('Map lookup is busy; try again in a moment', 429);
    const q = new URLSearchParams({ q: address, format: 'json', limit: '1', addressdetails: '0' });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers: { 'User-Agent': 'Mapper/2.0 (https://github.com/amiddlebrook/Mapper)', 'Accept-Language': 'en' } });
    if (!response.ok) return fail('Address lookup is unavailable; place a pin manually on the map', 502);
    const results = await response.json();
    if (!results?.length) return fail('Address not found. Try a more specific location or click the map.', 404);
    const point = { address: results[0].display_name, lat: Number(results[0].lat), lng: Number(results[0].lon) };
    await env.DB.prepare('INSERT OR REPLACE INTO geocode_cache (query, payload) VALUES (?, ?)').bind(key, JSON.stringify(point)).run();
    return json(point);
  }
  return fail('Not found', 404);
}
export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try { return await api(request, env); }
    catch (error) { console.error('Mapper API error', error); return fail(error.message === 'Invalid JSON' ? 'Invalid JSON' : 'Server error', error.message === 'Invalid JSON' ? 400 : 500); }
  }
};
