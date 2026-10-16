import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';
function env() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  return { DB: { prepare(sql) { let parameters = []; return { bind(...args) { parameters = args; return this; }, async first() { return db.prepare(sql).get(...parameters) || null; }, async all() { return { results: db.prepare(sql).all(...parameters) }; }, async run() { const result = db.prepare(sql).run(...parameters); return { meta: { changes: result.changes }, success: true }; } }; } }, ASSETS: { fetch: () => new Response('OK') } };
}
const origin = 'https://mapper.example';
const req = (path, method = 'GET', body, cookie) => new Request(origin + path, { method, headers: { ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const call = (e, path, method, body, cookie) => worker.fetch(req(path, method, body, cookie), e);
const parse = async (r) => ({ status: r.status, data: await r.json() });
async function guest(e) { const r = await call(e, '/api/session/guest', 'POST'); assert.equal(r.status, 201); const data = await r.json(); return { cookie: r.headers.get('set-cookie').split(';')[0], key: data.recoveryKey }; }

test('session recovery, private map access, ownership checks, public sharing', async () => {
  const e = env(); const a = await guest(e), b = await guest(e);
  assert.equal(a.key.length, 48);
  const created = await parse(await call(e, '/api/maps', 'POST', { name: 'Places' }, a.cookie));
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal((await call(e, `/api/maps/${id}`, 'GET', null, b.cookie)).status, 403);
  assert.equal((await call(e, `/api/maps/${id}/pins`, 'GET')).status, 403);
  assert.equal((await call(e, `/api/maps/${id}`, 'DELETE', null, b.cookie)).status, 404);
  const pin = await parse(await call(e, `/api/maps/${id}/pins`, 'POST', { address: 'Denver', lat: 39.74, lng: -104.99, type: 'Job', url: 'https://example.com/job' }, a.cookie));
  assert.equal(pin.status, 201);
  const duplicate = await call(e, `/api/maps/${id}/pins`, 'POST', { address: 'Denver', lat: 39.74, lng: -104.99, type: 'Job', url: 'https://example.com/job' }, a.cookie);
  assert.equal(duplicate.status, 409);
  const bad = await call(e, `/api/maps/${id}/pins`, 'POST', { address: 'Denver', lat: 1000, lng: 1, type: 'Job' }, a.cookie);
  assert.equal(bad.status, 400);
  assert.equal((await call(e, `/api/maps/${id}`, 'PATCH', { is_public: true }, a.cookie)).status, 200);
  assert.equal((await call(e, `/api/maps/${id}`, 'GET')).status, 200);
  assert.equal((await call(e, `/api/maps/${id}/pins`, 'GET')).status, 200);
  assert.equal((await call(e, `/api/maps/${id}/pins`, 'POST', { address: 'Wrong', lat: 1, lng: 1, type: 'Park' }, b.cookie)).status, 404);
  assert.equal((await call(e, `/api/maps/${id}`, 'PATCH', { is_public: false }, a.cookie)).status, 200);
  assert.equal((await call(e, `/api/maps/${id}`, 'GET')).status, 403);
  const recovered = await call(e, '/api/session/recover', 'POST', { key: a.key });
  assert.equal(recovered.status, 200);
  assert.equal((await call(e, '/api/maps', 'GET', null, recovered.headers.get('set-cookie').split(';')[0])).status, 200);
});

test('rejects cross-origin writes and insecure URLs; serves health/asset routes', async () => {
  const e = env(), a = await guest(e);
  const cross = await worker.fetch(new Request(origin + '/api/maps', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' }), e);
  assert.equal(cross.status, 403);
  const id = (await parse(await call(e, '/api/maps', 'POST', { name: 'Safe' }, a.cookie))).data.id;
  assert.equal((await call(e, `/api/maps/${id}/pins`, 'POST', { address: 'Test', lat: 1, lng: 1, type: 'Park', url: 'javascript:alert(1)' }, a.cookie)).status, 400);
  assert.equal((await call(e, '/api/auth/login', 'POST', { email: 'victim@example.com' })).status, 401);
  assert.equal((await call(e, '/api/health')).status, 200);
  assert.equal((await call(e, '/')).status, 200);
});
