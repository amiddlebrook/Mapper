// API Configuration
const API_BASE = window.location.origin;

// Default lists - always show these 3
const DEFAULT_LISTS = ['Housing', 'Jobs', 'Parks'];

// State
let state = {
    sessionId: null,
    user: null,
    isLoggedIn: false,
    customLists: [],
    items: {},
    collapsedLists: {},
    map: null,
    markers: {},
    satelliteLayer: null,
    streetLayer: null,
    // New: Map ID for cloud sync
    mapId: null
};

// Helper: Map Frontend List Names to Backend Types
function listNameToProps(listName) {
    if (listName === 'Housing') return { type: 'Housing' };
    if (listName === 'Jobs') return { type: 'Job' };
    if (listName === 'Parks') return { type: 'Park' };
    return { type: 'Custom', custom_type: listName };
}

function propsToListName(type, customType) {
    if (type === 'Housing') return 'Housing';
    if (type === 'Job') return 'Jobs';
    if (type === 'Park') return 'Parks';
    return customType;
}

// List colors - distinct, non-overlapping colors
const LIST_COLORS = {
    Housing: '#2A9D8F',  // Teal (matches logo)
    Jobs: '#E76F51',     // Coral/Orange
    Parks: '#F4A261'     // Sandy yellow
};

function getListColor(listName) {
    if (LIST_COLORS[listName]) return LIST_COLORS[listName];
    let hash = 0;
    for (let i = 0; i < listName.length; i++) {
        hash = listName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 80%, 65%)`;
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Check for OAuth callback in URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionFromCallback = urlParams.get('session');

    if (sessionFromCallback) {
        localStorage.setItem('sessionId', sessionFromCallback);
        state.sessionId = sessionFromCallback;
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        // Check for existing session
        state.sessionId = localStorage.getItem('sessionId');
    }

    // Initial render (empty/guest)
    initMap();
    setupEventListeners();
    updateListDropdown();
    renderLists();
    updateAuthUI();

    // Check for existing session
    if (state.sessionId) {
        try {
            await loadUser();
            updateAuthUI();
            // Now load data from cloud
            await loadCloudData();
        } catch (error) {
            console.log('Session expired or invalid', error);
            handleLogout();
        }
    }
});

// ============================================
// Storage (Only used when Logged In)
// ============================================

// ============================================
// Cloud Storage (Logged In)
// ============================================

async function loadCloudData() {
    if (!state.isLoggedIn || !state.sessionId) return;

    try {
        // 1. Get User's Map
        const mapsRes = await fetch(`${API_BASE}/api/maps`, {
            headers: { 'X-Session-ID': state.sessionId }
        });
        const maps = await mapsRes.json();

        if (maps.length > 0) {
            state.mapId = maps[0].id;
        } else {
            // Should have been created by backend, but just in case
            console.error('No map found for user');
            return;
        }

        // 2. Get Pins
        const pinsRes = await fetch(`${API_BASE}/api/maps/${state.mapId}/pins`, {
            headers: { 'X-Session-ID': state.sessionId }
        });
        const pins = await pinsRes.json();

        // 3. Clear and Rebuild State
        state.items = {};
        state.customLists = [];

        pins.forEach(pin => {
            const listName = propsToListName(pin.type, pin.custom_type);

            // Add to custom lists if not default
            if (!DEFAULT_LISTS.includes(listName) && !state.customLists.includes(listName)) {
                state.customLists.push(listName);
            }

            if (!state.items[listName]) {
                state.items[listName] = [];
            }

            state.items[listName].push({
                id: pin.id,
                url: pin.url,
                address: pin.address,
                lat: pin.lat,
                lng: pin.lng,
                created_at: pin.created_at
            });
        });

        updateListDropdown();
        renderLists();
        updateMapMarkers();

    } catch (e) {
        console.error('Error loading cloud data', e);
    }
}

// Deprecated: Local Storage functions removed
function saveToStorage() {
    // No-op for cloud sync
}

// ============================================
// Map
// ============================================

function initMap() {
    state.map = L.map('map').setView([39.8283, -98.5795], 4);

    state.satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19
    });

    state.streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    });

    state.satelliteLayer.addTo(state.map);

    document.getElementById('btnSatellite').addEventListener('click', () => {
        state.map.removeLayer(state.streetLayer);
        state.satelliteLayer.addTo(state.map);
        document.getElementById('btnSatellite').classList.add('active');
        document.getElementById('btnStreet').classList.remove('active');
    });

    document.getElementById('btnStreet').addEventListener('click', () => {
        state.map.removeLayer(state.satelliteLayer);
        state.streetLayer.addTo(state.map);
        document.getElementById('btnStreet').classList.add('active');
        document.getElementById('btnSatellite').classList.remove('active');
    });

    updateMapMarkers();
}

function createMarkerIcon(color) {
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            background-color: ${color};
            width: 24px;
            height: 24px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            border: 2px solid #0a0a0a;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
        "></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 24],
        popupAnchor: [0, -24]
    });
}

function updateMapMarkers() {
    Object.values(state.markers).forEach(marker => marker.remove());
    state.markers = {};

    const allItems = [];
    const allLists = [...DEFAULT_LISTS, ...state.customLists];

    allLists.forEach(listName => {
        const items = state.items[listName] || [];
        items.forEach(item => {
            allItems.push({ ...item, listName });
        });
    });

    if (allItems.length === 0) return;

    allItems.forEach(item => {
        const color = getListColor(item.listName);
        const icon = createMarkerIcon(color);
        const marker = L.marker([item.lat, item.lng], { icon }).addTo(state.map);

        marker.bindPopup(`
            <div class="popup-content">
                <h3>${item.listName}</h3>
                <p>${item.address}</p>
                <a href="https://${item.url}" target="_blank">${item.url}</a>
            </div>
        `);

        state.markers[item.id] = marker;
    });

    const bounds = L.latLngBounds(allItems.map(item => [item.lat, item.lng]));
    state.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
}

// ============================================
// Lists UI
// ============================================

function renderLists() {
    const container = document.getElementById('listsContainer');
    const allLists = [...DEFAULT_LISTS, ...state.customLists];

    container.innerHTML = '';

    allLists.forEach(listName => {
        const items = state.items[listName] || [];
        const isCollapsed = state.collapsedLists[listName];
        const color = getListColor(listName);

        const group = document.createElement('div');
        group.className = `list-group ${isCollapsed ? 'collapsed' : ''}`;
        group.dataset.type = listName;

        group.innerHTML = `
            <div class="list-group-header" onclick="toggleList('${listName}')" style="border-left: 3px solid ${color};">
                <div class="list-group-title">
                    <span class="arrow">▼</span>
                    <span>${listName}</span>
                </div>
                <span class="list-group-count">${items.length}</span>
            </div>
            <div class="list-group-items">
                ${items.length === 0 ?
                '<div class="list-group-empty">No items yet</div>' :
                items.map(item => `
                        <div class="list-item" data-id="${item.id}" onclick="focusItem('${item.id}', ${item.lat}, ${item.lng})">
                            <div class="list-item-info">
                                <div class="list-item-address">${item.address}</div>
                                <a href="https://${item.url}" target="_blank" class="list-item-url" onclick="event.stopPropagation()">${item.url}</a>
                            </div>
                            <div class="list-item-actions">
                                <button class="small" onclick="event.stopPropagation(); focusItem('${item.id}', ${item.lat}, ${item.lng})">View</button>
                                <button class="small danger" onclick="event.stopPropagation(); deleteItem('${listName}', '${item.id}')">Delete</button>
                            </div>
                        </div>
                    `).join('')
            }
            </div>
        `;

        container.appendChild(group);
    });
}

function toggleList(listName) {
    state.collapsedLists[listName] = !state.collapsedLists[listName];
    // Only save collapse state if logged in? Or maybe fine to save preference? 
    // User said "not saved", implies DATA. UI prefs maybe ok, but let's stick to strict no-save.
    saveToStorage();
    renderLists();
}

function focusItem(id, lat, lng) {
    state.map.setView([lat, lng], 16);

    if (state.markers[id]) {
        state.markers[id].openPopup();
    }

    document.querySelectorAll('.list-item').forEach(el => el.classList.remove('highlighted'));
    const item = document.querySelector(`[data-id="${id}"]`);
    if (item) {
        item.classList.add('highlighted');
        setTimeout(() => item.classList.remove('highlighted'), 3000);
    }
}

function updateListDropdown() {
    const select = document.getElementById('inputList');
    select.innerHTML = '';

    DEFAULT_LISTS.forEach(list => {
        const option = document.createElement('option');
        option.value = list;
        option.textContent = list;
        select.appendChild(option);
    });

    state.customLists.forEach(list => {
        const option = document.createElement('option');
        option.value = list;
        option.textContent = list;
        select.appendChild(option);
    });
}

// ============================================
// Event Listeners
// ============================================

function setupEventListeners() {
    // Add button opens modal
    document.getElementById('addBtn').addEventListener('click', openAddModal);

    // Add form
    document.getElementById('addForm').addEventListener('submit', handleAddItem);

    // New list button
    document.getElementById('newListBtn').addEventListener('click', openNewListModal);

    // New list form
    document.getElementById('newListForm').addEventListener('submit', handleCreateList);

    // Auth - Google OAuth
    document.getElementById('signInBtn').addEventListener('click', () => {
        window.location.href = `${API_BASE}/api/auth/google`;
    });

    // Profile
    document.getElementById('profileBtn').addEventListener('click', openProfileModal);
    document.getElementById('logoutBtnModal').addEventListener('click', handleLogout);
}

// ============================================
// Add Modal
// ============================================

function openAddModal() {
    document.getElementById('addModal').classList.add('active');
    document.getElementById('formError').classList.add('hidden');
    document.getElementById('inputUrl').focus();
}

function closeAddModal() {
    document.getElementById('addModal').classList.remove('active');
    document.getElementById('addForm').reset();
}

async function handleAddItem(e) {
    e.preventDefault();

    const url = document.getElementById('inputUrl').value;
    const address = document.getElementById('inputAddress').value;
    const listName = document.getElementById('inputList').value;
    const errorEl = document.getElementById('formError');

    errorEl.classList.add('hidden');

    try {
        // Geocode
        const geocodeQuery = address.trim() || url.trim();
        const geocodeResponse = await fetch(`${API_BASE}/api/geocode?address=${encodeURIComponent(geocodeQuery)}`, {
            headers: state.sessionId ? { 'X-Session-ID': state.sessionId } : undefined
        });

        if (!geocodeResponse.ok) {
            const errorPayload = await geocodeResponse.json();
            throw new Error(errorPayload.error || 'Address not found. Try a more specific address.');
        }

        const geocodeData = await geocodeResponse.json();
        const lat = geocodeData.lat;
        const lng = geocodeData.lng;
        const fullAddress = geocodeData.address;

        // Normalize URL
        let normalizedUrl = url.trim()
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, '')
            .replace(/^www\./, '')
            .toLowerCase();

        // Check for duplicates
        const items = state.items[listName] || [];
        if (items.some(item => item.url === normalizedUrl)) {
            throw new Error('This URL is already in this list');
        }

        // Create item locally
        const newItem = {
            id: crypto.randomUUID(),
            url: normalizedUrl,
            address: fullAddress,
            lat,
            lng,
            created_at: new Date().toISOString()
        };

        // IF LOGGED IN: Sync to Cloud
        if (state.isLoggedIn && state.sessionId && state.mapId) {
            const props = listNameToProps(listName);

            const res = await fetch(`${API_BASE}/api/maps/${state.mapId}/pins`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-ID': state.sessionId
                },
                body: JSON.stringify({
                    url: normalizedUrl,
                    address: fullAddress,
                    lat,
                    lng,
                    type: props.type,
                    custom_type: props.custom_type
                })
            });

            if (!res.ok) {
                const text = await res.text();
                let err;

                try {
                    err = JSON.parse(text);
                } catch (parseError) {
                    console.error('Failed to parse error response:', text);
                    throw new Error(`Failed to save to cloud (HTTP ${res.status})`);
                }

                throw new Error(err.error || 'Failed to save to cloud');
            }

            const savedPin = await res.json();
            newItem.id = savedPin.id; // Use server ID
        }

        if (!state.items[listName]) {
            state.items[listName] = [];
        }
        state.items[listName].unshift(newItem);

        // Make sure list is expanded
        state.collapsedLists[listName] = false;

        renderLists();
        updateMapMarkers();
        closeAddModal();

    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove('hidden');
    }
}

async function deleteItem(listName, itemId) {
    if (!confirm('Delete this item?')) return;

    // IF LOGGED IN: Sync Delete
    if (state.isLoggedIn && state.sessionId && state.mapId) {
        try {
            await fetch(`${API_BASE}/api/maps/${state.mapId}/pins/${itemId}`, {
                method: 'DELETE',
                headers: { 'X-Session-ID': state.sessionId }
            });
        } catch (e) {
            console.error('Failed to delete from cloud', e);
            alert('Failed to delete from cloud');
            return;
        }
    }

    state.items[listName] = (state.items[listName] || []).filter(item => item.id !== itemId);
    renderLists();
    updateMapMarkers();
}

// ============================================
// New List Modal
// ============================================

function openNewListModal() {
    document.getElementById('newListModal').classList.add('active');
    document.getElementById('newListName').focus();
}

function closeNewListModal() {
    document.getElementById('newListModal').classList.remove('active');
    document.getElementById('newListForm').reset();
}

function handleCreateList(e) {
    e.preventDefault();

    const name = document.getElementById('newListName').value.trim();

    if (!name) return;

    if (DEFAULT_LISTS.includes(name) || state.customLists.includes(name)) {
        alert('This list already exists!');
        return;
    }

    state.customLists.push(name);
    state.items[name] = [];

    // Note: We don't explicitly sync "User Lists" to backend until an item is added to them.
    // The backend infers lists from Pin Types.
    // This is fine for now.

    updateListDropdown();
    renderLists();
    closeNewListModal();
}

// ============================================
// Auth & Profile
// ============================================

async function handleLogout() {
    try {
        if (state.sessionId) {
            await fetch(`${API_BASE}/api/auth/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-ID': state.sessionId
                }
            });
        }
    } catch (e) { console.error(e); }

    // Clear everything
    localStorage.removeItem('sessionId');
    localStorage.removeItem('customLists');
    // Also clear list items from storage
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('list_') || key === 'collapsedLists') {
            localStorage.removeItem(key);
        }
    });

    state.sessionId = null;
    state.user = null;
    state.isLoggedIn = false;
    state.customLists = [];
    state.items = {};
    state.collapsedLists = {};
    state.mapId = null;

    closeProfileModal();
    updateAuthUI();
    renderLists();
    updateListDropdown();
    updateMapMarkers();

    // Replace URL to remove session param
    window.history.replaceState({}, document.title, '/');
    window.location.reload();
}

async function loadUser() {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { 'X-Session-ID': state.sessionId }
    });

    if (!response.ok) throw new Error('Session invalid');

    const data = await response.json();
    state.user = data;
    state.isLoggedIn = true;
}

function updateAuthUI() {
    const signInBtn = document.getElementById('signInBtn');
    const userInfo = document.getElementById('userInfo');

    if (state.isLoggedIn && state.user) {
        signInBtn.classList.add('hidden');
        userInfo.classList.remove('hidden');
    } else {
        signInBtn.classList.remove('hidden');
        userInfo.classList.add('hidden');
    }
}

// ============================================
// Profile Logic
// ============================================

function openProfileModal() {
    if (!state.user) return;

    const emailEl = document.getElementById('profileEmail');
    const listCountEl = document.getElementById('profileListCount');
    const itemCountEl = document.getElementById('profileItemCount');

    emailEl.textContent = state.user.email;

    const listCount = DEFAULT_LISTS.length + state.customLists.length;
    let itemCount = 0;
    Object.values(state.items).forEach(items => itemCount += items.length);

    listCountEl.textContent = listCount;
    itemCountEl.textContent = itemCount;

    document.getElementById('profileModal').classList.add('active');
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.remove('active');
}

function downloadData() {
    // Flatten data to CSV
    const rows = [['List Name', 'Address', 'URL', 'Latitude', 'Longitude', 'Date Added']];

    // Process all lists
    [...DEFAULT_LISTS, ...state.customLists].forEach(listName => {
        const items = state.items[listName] || [];
        items.forEach(item => {
            // Escape field values to handle commas/quotes in data
            const clean = (text) => {
                if (!text) return '';
                const str = String(text).replace(/"/g, '""'); // Double up quotes
                return `"${str}"`; // Wrap in quotes
            };

            rows.push([
                clean(listName),
                clean(item.address),
                clean(item.url),
                item.lat,
                item.lng,
                clean(item.created_at || new Date().toISOString())
            ]);
        });
    });

    // Convert to CSV string
    const csvContent = rows.map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `list-mapper-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================
// Global functions
// ============================================

window.toggleList = toggleList;
window.focusItem = focusItem;
window.deleteItem = deleteItem;
window.openAddModal = openAddModal;
window.closeAddModal = closeAddModal;
window.openNewListModal = openNewListModal;
window.closeNewListModal = closeNewListModal;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.downloadData = downloadData;
