-- A durable latch closes first-account setup on existing installations, and
-- remains closed if all accounts are later removed.
CREATE TABLE first_admin_bootstrap (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  user_id TEXT NOT NULL
);
INSERT INTO first_admin_bootstrap(singleton, user_id)
SELECT 1, 'existing-installation' WHERE EXISTS (SELECT 1 FROM "user");
-- Provisioning or invitation claims also permanently close setup, even if an
-- operator later deletes the last account.
CREATE TRIGGER close_first_admin_bootstrap_after_user_insert
AFTER INSERT ON "user" BEGIN
  INSERT OR IGNORE INTO first_admin_bootstrap(singleton, user_id) VALUES (1, NEW.id);
END;
CREATE TABLE first_admin_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
