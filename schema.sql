-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Maps table
CREATE TABLE IF NOT EXISTS maps (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_public INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_maps_user_id ON maps(user_id);
CREATE INDEX IF NOT EXISTS idx_maps_is_public ON maps(is_public);

-- Pins table
CREATE TABLE IF NOT EXISTS pins (
    id TEXT PRIMARY KEY,
    map_id TEXT NOT NULL,
    url TEXT NOT NULL,
    address TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('Housing', 'Job', 'Park', 'Custom')),
    custom_type TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE,
    UNIQUE(map_id, url)
);

CREATE INDEX IF NOT EXISTS idx_pins_map_id ON pins(map_id);
CREATE INDEX IF NOT EXISTS idx_pins_url ON pins(map_id, url);

-- Sessions table for authentication
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- API Keys table for monetization
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    key_hash TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free' CHECK(tier IN ('free', 'pro', 'enterprise')),
    requests_today INTEGER NOT NULL DEFAULT 0,
    last_request_date TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_email ON api_keys(email);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
