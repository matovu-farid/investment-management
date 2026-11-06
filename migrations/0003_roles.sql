-- Apply as a D1 migration. There are deliberately no automatic role grants.
-- Grant an initial administrator out of band only after verifying their user ID.
CREATE TABLE app_user_roles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('admin')),
  granted_by TEXT NOT NULL CHECK(length(trim(granted_by)) > 0),
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
