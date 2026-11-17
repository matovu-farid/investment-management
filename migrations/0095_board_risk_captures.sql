-- Temporary, owner-bound server-generated risk pages. Saved packets copy their data.
CREATE TABLE board_risk_captures (
 id TEXT PRIMARY KEY,
 created_by TEXT NOT NULL REFERENCES "user"(id),
 profile_json TEXT NOT NULL CHECK(json_valid(profile_json)),
 version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX board_risk_captures_expiry ON board_risk_captures(created_at);
