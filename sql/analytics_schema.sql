CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_name TEXT NOT NULL,
    payload_json TEXT,
    path TEXT,
    href TEXT,
    referrer TEXT,
    sent_at_client TEXT,
    user_agent TEXT,
    ip TEXT,
    country TEXT,
    colo TEXT,
    ray_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name
ON analytics_events(event_name);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
ON analytics_events(created_at);

CREATE TABLE IF NOT EXISTS analytics_report_rate_limits (
    rate_key TEXT PRIMARY KEY,
    sent_at TEXT NOT NULL
);
