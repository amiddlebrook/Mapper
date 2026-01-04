// API Configuration
const API_BASE = window.location.origin;

// State
let state = {
    sessionId: localStorage.getItem('sessionId'),
    user: null,
    maps: [],
    currentMap: null,
    pins: [],
    map: null,
    markers: {}
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    if (state.sessionId) {
        try {
            await loadUser();
            await initApp();
        } catch (error) {
            console.error('Session invalid:', error);
            localStorage.removeItem('sessionId');
            state.sessionId = null;
            showLoginScreen();
        }
    } else {
        showLoginScreen();
    }
});

// ============================================
// Authentication
// ============================================

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const errorEl = document.getElementById('loginError');

    try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        state.sessionId = data.sessionId;
        state.user = { id: data.userId, email: data.email };
        localStorage.setItem('sessionId', data.sessionId);

        await initApp();
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove('hidden');
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        localStorage.removeItem('sessionId');
        state.sessionId = null;
        state.user = null;
        state.maps = [];
        state.currentMap = null;
        state.pins = [];
        location.reload();
    }
});

async function loadUser() {
    const data = await apiRequest('/api/auth/me');
    state.user = data;
}

// ============================================
// App Initialization
// ============================================

async function initApp() {
    showAppScreen();
    initMap();
    await loadMaps();
    setupEventListeners();
}

function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
}

function showAppScreen() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    document.getElementById('userEmail').textContent = state.user.email;
}

function initMap() {
    // Initialize Leaflet map
    state.map = L.map('map').setView([37.7749, -122.4194], 12); // Default to San Francisco

    // Use OpenStreetMap tiles (free, no API key)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(state.map);

    // Custom marker colors
    createCustomMarkerIcons();
}

function createCustomMarkerIcons() {
    const colors = {
        Housing: '#6aff8f',
        Job: '#4a9eff',
        Park: '#83ff6a',
        Custom: '#ff6aeb'
    };

    state.markerIcons = {};

    for (const [type, color] of Object.entries(colors)) {
        state.markerIcons[type] = L.divIcon({
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
}

function setupEventListeners() {
    // Pin form
    document.getElementById('pinForm').addEventListener('submit', handleAddPin);

    // Type selector
    document.getElementById('pinType').addEventListener('change', (e) => {
        const customGroup = document.getElementById('customTypeGroup');
        if (e.target.value === 'Custom') {
            customGroup.classList.remove('hidden');
        } else {
            customGroup.classList.add('hidden');
        }
    });

    // New map button
    document.getElementById('newMapBtn').addEventListener('click', openNewMapModal);

    // New map form
    document.getElementById('newMapForm').addEventListener('submit', handleCreateMap);

    // Share button
    document.getElementById('shareMapBtn').addEventListener('click', openShareModal);
}

// ============================================
// Maps Management
// ============================================

async function loadMaps() {
    try {
        state.maps = await apiRequest('/api/maps');

        if (state.maps.length === 0) {
            // Create first map automatically
            const firstMap = await apiRequest('/api/maps', {
                method: 'POST',
                body: JSON.stringify({
                    name: 'My First Map',
                    description: 'Start adding locations here',
                    is_public: false
                })
            });
            state.maps = [firstMap];
        }

        renderMapTabs();
        selectMap(state.maps[0].id);
    } catch (error) {
        console.error('Error loading maps:', error);
    }
}

function renderMapTabs() {
    const tabsContainer = document.getElementById('mapTabs');
    tabsContainer.innerHTML = '';

    state.maps.forEach(map => {
        const tab = document.createElement('div');
        tab.className = 'map-tab';
        tab.textContent = map.name;
        tab.onclick = () => selectMap(map.id);

        if (state.currentMap && state.currentMap.id === map.id) {
            tab.classList.add('active');
        }

        tabsContainer.appendChild(tab);
    });
}

async function selectMap(mapId) {
    try {
        state.currentMap = state.maps.find(m => m.id === mapId);
        renderMapTabs();
        await loadPins(mapId);
    } catch (error) {
        console.error('Error selecting map:', error);
    }
}

function openNewMapModal() {
    document.getElementById('newMapModal').classList.add('active');
}

function closeNewMapModal() {
    document.getElementById('newMapModal').classList.remove('active');
    document.getElementById('newMapForm').reset();
}

async function handleCreateMap(e) {
    e.preventDefault();

    const name = document.getElementById('mapName').value;
    const description = document.getElementById('mapDescription').value;
    const isPublic = document.getElementById('mapPublic').checked;

    try {
        const newMap = await apiRequest('/api/maps', {
            method: 'POST',
            body: JSON.stringify({ name, description, is_public: isPublic })
        });

        state.maps.push(newMap);
        renderMapTabs();
        selectMap(newMap.id);
        closeNewMapModal();
    } catch (error) {
        alert('Error creating map: ' + error.message);
    }
}

function openShareModal() {
    if (!state.currentMap) return;

    const modal = document.getElementById('shareMapModal');
    const content = document.getElementById('shareContent');

    if (state.currentMap.is_public) {
        const shareUrl = `${window.location.origin}?map=${state.currentMap.id}`;
        content.innerHTML = `
            <p>This map is public. Anyone with this link can view it:</p>
            <div class="share-url">${shareUrl}</div>
            <button class="primary" style="width: 100%; margin-top: 1rem;" onclick="copyShareUrl('${shareUrl}')">
                Copy Link
            </button>
        `;
    } else {
        content.innerHTML = `
            <p>This map is private. Make it public to share:</p>
            <button class="primary" style="width: 100%; margin-top: 1rem;" onclick="makeMapPublic()">
                Make Public
            </button>
        `;
    }

    modal.classList.add('active');
}

function closeShareModal() {
    document.getElementById('shareMapModal').classList.remove('active');
}

function copyShareUrl(url) {
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
}

async function makeMapPublic() {
    try {
        await apiRequest(`/api/maps/${state.currentMap.id}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: state.currentMap.name,
                description: state.currentMap.description,
                is_public: true
            })
        });

        state.currentMap.is_public = 1;
        closeShareModal();
        alert('Map is now public!');
    } catch (error) {
        alert('Error making map public: ' + error.message);
    }
}

// ============================================
// Pins Management
// ============================================

async function loadPins(mapId) {
    try {
        state.pins = await apiRequest(`/api/maps/${mapId}/pins`);
        renderPins();
        updateMapMarkers();
    } catch (error) {
        console.error('Error loading pins:', error);
    }
}

function renderPins() {
    const listContainer = document.getElementById('pinList');
    const countEl = document.getElementById('pinCount');

    countEl.textContent = `${state.pins.length} location${state.pins.length !== 1 ? 's' : ''}`;

    if (state.pins.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <h3>No pins yet</h3>
                <p>Add your first location using the form above</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = '';

    state.pins.forEach(pin => {
        const item = document.createElement('div');
        item.className = 'pin-item';
        item.dataset.pinId = pin.id;

        const typeClass = pin.type.toLowerCase();
        const displayType = pin.type === 'Custom' && pin.custom_type ? pin.custom_type : pin.type;

        item.innerHTML = `
            <div class="pin-info">
                <span class="pin-type ${typeClass}">${displayType}</span>
                <div class="pin-address">${pin.address}</div>
                <a href="https://${pin.url}" target="_blank" class="pin-url">${pin.url}</a>
            </div>
            <div class="pin-actions">
                <button onclick="centerOnPin(${pin.lat}, ${pin.lng})">View</button>
                <button class="danger" onclick="deletePin('${pin.id}')">Delete</button>
            </div>
        `;

        item.addEventListener('click', (e) => {
            if (!e.target.closest('button') && !e.target.closest('a')) {
                centerOnPin(pin.lat, pin.lng);
            }
        });

        listContainer.appendChild(item);
    });
}

function updateMapMarkers() {
    // Clear existing markers
    Object.values(state.markers).forEach(marker => marker.remove());
    state.markers = {};

    if (state.pins.length === 0) {
        state.map.setView([37.7749, -122.4194], 12);
        return;
    }

    // Add new markers
    state.pins.forEach(pin => {
        const icon = state.markerIcons[pin.type] || state.markerIcons.Custom;
        const marker = L.marker([pin.lat, pin.lng], { icon }).addTo(state.map);

        const displayType = pin.type === 'Custom' && pin.custom_type ? pin.custom_type : pin.type;

        marker.bindPopup(`
            <div class="popup-content">
                <h3>${displayType}</h3>
                <p>${pin.address}</p>
                <a href="https://${pin.url}" target="_blank">${pin.url}</a>
            </div>
        `);

        state.markers[pin.id] = marker;
    });

    // Fit map to show all markers
    const bounds = L.latLngBounds(state.pins.map(p => [p.lat, p.lng]));
    state.map.fitBounds(bounds, { padding: [50, 50] });
}

async function handleAddPin(e) {
    e.preventDefault();

    const url = document.getElementById('pinUrl').value;
    const address = document.getElementById('pinAddress').value;
    const type = document.getElementById('pinType').value;
    const customType = document.getElementById('customType').value;

    const errorEl = document.getElementById('formError');
    const successEl = document.getElementById('formSuccess');

    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');

    try {
        // Geocode address
        const geocoded = await apiRequest(`/api/geocode?address=${encodeURIComponent(address)}`);

        // Add pin
        const newPin = await apiRequest(`/api/maps/${state.currentMap.id}/pins`, {
            method: 'POST',
            body: JSON.stringify({
                url,
                address: geocoded.address,
                lat: geocoded.lat,
                lng: geocoded.lng,
                type,
                custom_type: type === 'Custom' ? customType : null
            })
        });

        state.pins.unshift(newPin);
        renderPins();
        updateMapMarkers();

        // Reset form
        document.getElementById('pinForm').reset();
        document.getElementById('customTypeGroup').classList.add('hidden');

        successEl.textContent = 'Pin added successfully!';
        successEl.classList.remove('hidden');

        setTimeout(() => successEl.classList.add('hidden'), 3000);
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove('hidden');
    }
}

async function deletePin(pinId) {
    if (!confirm('Are you sure you want to delete this pin?')) {
        return;
    }

    try {
        await apiRequest(`/api/maps/${state.currentMap.id}/pins/${pinId}`, {
            method: 'DELETE'
        });

        state.pins = state.pins.filter(p => p.id !== pinId);
        renderPins();
        updateMapMarkers();
    } catch (error) {
        alert('Error deleting pin: ' + error.message);
    }
}

function centerOnPin(lat, lng) {
    state.map.setView([lat, lng], 15);

    // Highlight corresponding pin in list
    document.querySelectorAll('.pin-item').forEach(item => {
        item.classList.remove('highlighted');
    });

    const pin = state.pins.find(p => p.lat === lat && p.lng === lng);
    if (pin) {
        const item = document.querySelector(`[data-pin-id="${pin.id}"]`);
        if (item) {
            item.classList.add('highlighted');
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });

            setTimeout(() => item.classList.remove('highlighted'), 3000);
        }
    }
}

// ============================================
// API Helper
// ============================================

async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (state.sessionId) {
        headers['X-Session-ID'] = state.sessionId;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}

// ============================================
// URL Parameters (for shared maps)
// ============================================

const urlParams = new URLSearchParams(window.location.search);
const sharedMapId = urlParams.get('map');

if (sharedMapId && !state.sessionId) {
    // Load public map without authentication
    loadPublicMap(sharedMapId);
}

async function loadPublicMap(mapId) {
    try {
        const map = await fetch(`${API_BASE}/api/maps/${mapId}`).then(r => r.json());

        if (!map.is_public) {
            alert('This map is private');
            return;
        }

        // Show limited UI for public viewing
        document.getElementById('loginScreen').innerHTML = `
            <div class="login-box" style="max-width: 90%; max-height: 90vh; overflow: auto;">
                <h2>${map.name}</h2>
                <p style="color: var(--text-secondary); margin-bottom: 1rem;">${map.description || ''}</p>
                <div id="publicMap" style="height: 400px; margin-bottom: 1rem;"></div>
                <div id="publicPins"></div>
                <button class="primary" onclick="location.href='${window.location.origin}'" style="margin-top: 1rem;">
                    Create Your Own Map
                </button>
            </div>
        `;

        // Initialize map for public viewing
        const publicMap = L.map('publicMap').setView([37.7749, -122.4194], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(publicMap);

        const pins = await fetch(`${API_BASE}/api/maps/${mapId}/pins`).then(r => r.json());

        pins.forEach(pin => {
            L.marker([pin.lat, pin.lng]).addTo(publicMap)
                .bindPopup(`
                    <strong>${pin.type}</strong><br>
                    ${pin.address}<br>
                    <a href="https://${pin.url}" target="_blank">${pin.url}</a>
                `);
        });

        if (pins.length > 0) {
            const bounds = L.latLngBounds(pins.map(p => [p.lat, p.lng]));
            publicMap.fitBounds(bounds, { padding: [50, 50] });
        }

    } catch (error) {
        console.error('Error loading public map:', error);
        alert('Error loading map');
    }
}
