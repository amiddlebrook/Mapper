const $ = (id) => document.getElementById(id);
const state = { user: null, maps: [], current: null, pins: [], markers: new Map(), newKey: '', selected: null };
const categoryLabels = { Housing: 'Housing', Job: 'Jobs', Park: 'Parks', Custom: 'Other' };
const categoryIcons = { Housing: '⌂', Job: '◈', Park: '♣', Custom: '⌖' };
const categoryColors = { Housing: '#1da67b', Job: '#ef8a4c', Park: '#6aa7d1', Custom: '#b58bdc' };
let toastTimer;
let leaflet;
const show = (id, visible) => $(id).classList.toggle('hidden', !visible);
function message(text) { $('toast').textContent = text; show('toast', true); clearTimeout(toastTimer); toastTimer = setTimeout(() => show('toast', false), 4500); }
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, ...options });
  let data = null;
  try { data = await response.json(); } catch { /* HTTP failure */ }
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}
function el(tag, classes = '', content = '') { const item = document.createElement(tag); item.className = classes; if (content !== '') item.textContent = String(content); return item; }
function parseLink(raw) { try { const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; } }
function visiblePinName(pin) { return pin.address.split(',')[0] || pin.address; }
function category(pin) { return pin.type === 'Custom' ? (pin.custom_type || 'Other') : categoryLabels[pin.type] || 'Other'; }
function mapUrl(id) { return `${location.origin}/?map=${encodeURIComponent(id)}`; }
function navigateMap(id) { const url = new URL(location.href); if (id) url.searchParams.set('map', id); else url.searchParams.delete('map'); url.searchParams.delete('error'); history.replaceState(null, '', `${url.pathname}${url.search}`); }
function initMap() {
  leaflet = L.map('map', { zoomControl: false, preferCanvas: true }).setView([39.8283, -98.5795], 4);
  L.control.zoom({ position: 'bottomright' }).addTo(leaflet);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(leaflet);
  leaflet.on('click', (event) => {
    if (!state.user || !state.current?.is_owner) return;
    const lat = Number(event.latlng.lat.toFixed(6)), lng = Number(event.latlng.lng.toFixed(6));
    $('pinForm').elements.lat.value = lat;
    $('pinForm').elements.lng.value = lng;
    if (!$('pinDialog').open) $('pinDialog').showModal();
    message('Coordinates selected. Add a name to save this place.');
  });
}
function setView(view) {
  for (const id of ['welcome', 'empty', 'explorer']) show(id, id === view);
  if (view === 'explorer') requestAnimationFrame(() => leaflet.invalidateSize());
}
async function initialize() {
  initMap();
  const error = new URLSearchParams(location.search).get('error');
  if (error) message('Google sign-in could not be completed. Try again.');
  try { const session = await api('/api/session'); state.user = session.user; } catch { state.user = null; }
  await loadWorkspace();
}
async function loadWorkspace(target) {
  $('sidebar').classList.remove('open');
  $('accountLabel').textContent = state.user?.email || 'My workspace';
  if (!state.user) {
    state.maps = [];
    renderMaps();
    const shared = new URLSearchParams(location.search).get('map');
    if (shared) {
      try { await selectMap(shared, true); return; } catch (error) { message(error.message); }
    }
    $('pageTitle').textContent = 'Overview';
    setView('welcome'); return;
  }
  try {
    state.maps = await api('/api/maps');
    renderMaps();
    const shared = target || new URLSearchParams(location.search).get('map');
    const id = shared || state.maps[0]?.id;
    if (!id) { state.current = null; $('pageTitle').textContent = 'Overview'; setView('empty'); return; }
    await selectMap(id, !!shared);
  } catch (error) { message(error.message); setView('empty'); }
}
function renderMaps() {
  const nav = $('mapList'); nav.replaceChildren();
  if (!state.maps.length) { nav.append(el('p', 'storage-note', 'No maps yet')); return; }
  state.maps.forEach(map => {
    const button = el('button', map.id === state.current?.id ? 'active' : '');
    const icon = el('span', '', '▤');
    const title = el('span', '', map.name);
    button.append(icon, title);
    button.title = map.name;
    button.addEventListener('click', () => selectMap(map.id).catch(error => message(error.message)));
    nav.append(button);
  });
}
async function selectMap(id, shared = false) {
  const map = await api(`/api/maps/${encodeURIComponent(id)}`);
  const pins = await api(`/api/maps/${encodeURIComponent(id)}/pins`);
  state.current = map;
  state.pins = pins;
  $('pageTitle').textContent = map.name;
  $('mapHeading').textContent = map.name;
  $('mapDescription').textContent = map.description || 'Your favorite places, all in one view.';
  $('visibilityText').textContent = map.is_public ? 'Public' : 'Private';
  $('pinCount').textContent = pins.length;
  $('categoryCount').textContent = new Set(pins.map(category)).size;
  $('newPinBtn').disabled = !map.is_owner;
  $('shareBtn').disabled = !map.is_owner && !map.is_public;
  $('mapSettingsBtn').disabled = !map.is_owner;
  $('exportBtn').disabled = !pins.length;
  show('readOnlyBadge', !map.is_owner);
  show('mapSettingsBtn', map.is_owner);
  show('mapTip', map.is_owner);
  $('searchInput').value = '';
  $('filterCategory').replaceChildren(new Option('All categories', ''));
  [...new Set(pins.map(category))].sort().forEach(label => $('filterCategory').append(new Option(label, label)));
  navigateMap(map.id);
  renderMaps();
  setView('explorer');
  renderPins();
  drawMarkers();
}
function filteredPins() {
  const query = $('searchInput').value.trim().toLowerCase();
  const chosen = $('filterCategory').value;
  return state.pins.filter(pin => (!chosen || category(pin) === chosen) && (!query || `${pin.address} ${pin.url} ${category(pin)}`.toLowerCase().includes(query)));
}
function renderPins() {
  const pins = filteredPins();
  const list = $('pinList'); list.replaceChildren();
  $('resultCount').textContent = `${pins.length} of ${state.pins.length} places`;
  if (!pins.length) { const empty = el('div', 'pin-list-empty'); empty.append(el('strong', '', state.pins.length ? 'No matching places' : 'No places yet'), el('span', '', state.pins.length ? 'Try a different filter.' : 'Click Add a place or select a location on the map.')); list.append(empty); return; }
  pins.forEach(pin => {
    const card = el('article', `pin-card${pin.id === state.selected ? ' selected' : ''}`);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    const icon = el('div', 'pin-icon', categoryIcons[pin.type] || '⌖');
    const copy = el('div', 'pin-copy');
    copy.append(el('h3', '', visiblePinName(pin)), el('p', '', pin.address));
    copy.append(el('span', 'pin-category', category(pin)));
    const actions = el('div', 'pin-actions');
    const link = el('a', '', '↗');
    link.title = 'Open source link'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.href = parseLink(pin.url) || '#';
    link.addEventListener('click', event => event.stopPropagation());
    actions.append(link);
    if (state.current?.is_owner) {
      const remove = el('button', '', '×'); remove.type = 'button'; remove.title = 'Delete place';
      remove.addEventListener('click', async event => {
        event.stopPropagation(); if (!confirm(`Remove ${pin.address}?`)) return;
        try { await api(`/api/maps/${state.current.id}/pins/${pin.id}`, { method: 'DELETE' }); await selectMap(state.current.id); message('Place removed'); } catch (error) { message(error.message); }
      }); actions.append(remove);
    }
    card.append(icon, copy, actions);
    const focus = () => { state.selected = pin.id; leaflet.flyTo([pin.lat, pin.lng], 14, { duration: 0.65 }); state.markers.get(pin.id)?.openPopup(); renderPins(); };
    card.addEventListener('click', focus);
    card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focus(); } });
    list.append(card);
  });
}
function drawMarkers() {
  for (const marker of state.markers.values()) marker.remove();
  state.markers.clear();
  for (const pin of state.pins) {
    const color = categoryColors[pin.type] || '#1da67b';
    const marker = L.circleMarker([pin.lat, pin.lng], { radius: 9, weight: 3, color: 'white', fillColor: color, fillOpacity: 1 }).addTo(leaflet);
    const popup = el('div', 'marker-popup');
    const name = el('strong', '', visiblePinName(pin));
    const address = el('p', '', pin.address);
    const link = el('a', '', 'Open link ↗'); link.href = parseLink(pin.url) || '#'; link.target = '_blank'; link.rel = 'noopener noreferrer';
    popup.append(name, address, link);
    marker.bindPopup(popup);
    state.markers.set(pin.id, marker);
  }
  if (state.pins.length) {
    const bounds = L.latLngBounds(state.pins.map(pin => [pin.lat, pin.lng]));
    leaflet.fitBounds(bounds.pad(.2), { maxZoom: 13, padding: [40, 40], animate: false });
  } else leaflet.setView([39.8283, -98.5795], 4);
}
function openMapDialog(edit = false) {
  if (!state.user) { message('Create a workspace first'); return; }
  const form = $('mapForm'); form.reset();
  form.dataset.editId = edit && state.current?.is_owner ? state.current.id : '';
  $('mapDialogTitle').textContent = form.dataset.editId ? 'Map settings' : 'New map';
  show('deleteMapBtn', !!form.dataset.editId);
  if (form.dataset.editId) {
    form.elements.name.value = state.current.name;
    form.elements.description.value = state.current.description || '';
    form.elements.is_public.checked = !!state.current.is_public;
  }
  $('mapDialog').showModal();
}
async function saveMap(event) {
  event.preventDefault();
  const form = event.currentTarget, editId = form.dataset.editId;
  const body = JSON.stringify({ name: form.elements.name.value, description: form.elements.description.value, is_public: form.elements.is_public.checked });
  try {
    const saved = await api(editId ? `/api/maps/${editId}` : '/api/maps', { method: editId ? 'PATCH' : 'POST', body });
    $('mapDialog').close(); await loadWorkspace(saved.id); message(editId ? 'Map updated' : 'Map created');
  } catch (error) { message(error.message); }
}
async function savePin(event) {
  event.preventDefault();
  if (!state.current?.is_owner) return;
  const form = event.currentTarget;
  const body = JSON.stringify({ address: form.elements.address.value, lat: Number(form.elements.lat.value), lng: Number(form.elements.lng.value), url: form.elements.url.value, type: form.elements.type.value, custom_type: form.elements.custom_type.value });
  try {
    await api(`/api/maps/${state.current.id}/pins`, { method: 'POST', body });
    $('pinDialog').close(); form.reset(); await selectMap(state.current.id); message('Place added to your map');
  } catch (error) { message(error.message); }
}
async function lookupAddress() {
  const address = $('pinForm').elements.address.value.trim();
  if (!address) { message('Enter an address to look up'); return; }
  $('geocodeBtn').disabled = true;
  try {
    const point = await api(`/api/geocode?address=${encodeURIComponent(address)}`);
    $('pinForm').elements.lat.value = point.lat;
    $('pinForm').elements.lng.value = point.lng;
    message('Location found. Review the coordinates and save.');
    leaflet.flyTo([point.lat, point.lng], 13);
  } catch (error) { message(error.message); } finally { $('geocodeBtn').disabled = false; }
}
function exportCsv() {
  const quote = value => { const text = String(value ?? ''); const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; };
  const lines = [['Name / Address', 'Link', 'Category', 'Latitude', 'Longitude'], ...state.pins.map(pin => [pin.address, pin.url, category(pin), pin.lat, pin.lng])];
  const blob = new Blob([lines.map(line => line.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `mapper-${(state.current?.name || 'places').replace(/[^a-z0-9]+/gi, '-')}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function createWorkspace() {
  try {
    const result = await api('/api/session/guest', { method: 'POST' });
    state.user = result.user; state.newKey = result.recoveryKey || '';
    await loadWorkspace();
    $('newKey').value = state.newKey; show('newKeyArea', !!state.newKey);
    $('accountDialog').showModal();
    message('Workspace created — save your recovery key');
  } catch (error) { message(error.message); }
}
async function recoverWorkspace(event) {
  event.preventDefault();
  try {
    const result = await api('/api/session/recover', { method: 'POST', body: JSON.stringify({ key: event.currentTarget.elements.key.value.trim() }) });
    state.user = result.user; $('recoverDialog').close(); await loadWorkspace(); message('Workspace restored');
  } catch (error) { message(error.message); }
}
async function shareMap() {
  if (!state.current) return;
  if (state.current.is_owner && !state.current.is_public) {
    if (!confirm('This map is private. Make it public and create a read-only link?')) return;
    try { await api(`/api/maps/${state.current.id}`, { method: 'PATCH', body: JSON.stringify({ is_public: true }) }); await selectMap(state.current.id); } catch (error) { message(error.message); return; }
  }
  try { await navigator.clipboard.writeText(mapUrl(state.current.id)); message('Public read-only link copied'); }
  catch { prompt('Copy this link:', mapUrl(state.current.id)); }
}
function bindEvents() {
  $('newMapBtn').addEventListener('click', () => openMapDialog());
  $('emptyNewMap').addEventListener('click', () => openMapDialog());
  $('newPinBtn').addEventListener('click', () => { $('pinForm').reset(); $('pinDialog').showModal(); });
  $('createWorkspaceBtn').addEventListener('click', createWorkspace);
  $('recoverBtn').addEventListener('click', () => $('recoverDialog').showModal());
  $('mapSettingsBtn').addEventListener('click', () => openMapDialog(true));
  $('mapForm').addEventListener('submit', saveMap);
  $('pinForm').addEventListener('submit', savePin);
  $('recoverForm').addEventListener('submit', recoverWorkspace);
  $('geocodeBtn').addEventListener('click', lookupAddress);
  $('searchInput').addEventListener('input', renderPins);
  $('filterCategory').addEventListener('change', renderPins);
  $('shareBtn').addEventListener('click', shareMap);
  $('exportBtn').addEventListener('click', exportCsv);
  $('pinType').addEventListener('change', () => show('customLabel', $('pinType').value === 'Custom'));
  $('accountBtn').addEventListener('click', () => { if (!state.user) { $('recoverDialog').showModal(); return; } $('newKey').value = state.newKey; show('newKeyArea', !!state.newKey); $('accountDialog').showModal(); });
  $('copyKeyBtn').addEventListener('click', async () => { try { await navigator.clipboard.writeText(state.newKey); message('Recovery key copied'); } catch { $('newKey').select(); document.execCommand('copy'); message('Recovery key selected'); } });
  $('signOutBtn').addEventListener('click', async () => { if (!confirm('Sign out? Make sure you saved your recovery key first.')) return; try { await api('/api/session/logout', { method: 'POST' }); location.href = '/'; } catch (error) { message(error.message); } });
  $('deleteMapBtn').addEventListener('click', async () => { if (!state.current?.is_owner || !confirm(`Permanently delete "${state.current.name}" and all its places?`)) return; try { await api(`/api/maps/${state.current.id}`, { method: 'DELETE' }); $('mapDialog').close(); navigateMap(null); state.current = null; await loadWorkspace(); message('Map deleted'); } catch (error) { message(error.message); } });
  document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $('mobileMenu').addEventListener('click', () => $('sidebar').classList.toggle('open'));
}
bindEvents();
initialize().catch(error => message(error.message));
