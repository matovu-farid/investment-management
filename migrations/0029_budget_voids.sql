-- Corrections preserve the original budget and its audit trail.
CREATE TABLE budget_voids (
 id TEXT PRIMARY KEY NOT NULL,
 budget_id TEXT NOT NULL UNIQUE REFERENCES budget_lines(id),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500),
 created_by TEXT NOT NULL REFERENCES "user"(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 request_key TEXT NOT NULL UNIQUE
);
CREATE TRIGGER budget_void_admin BEFORE INSERT ON budget_voids WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') BEGIN SELECT RAISE(ABORT,'unauthorized'); END;
CREATE TRIGGER budget_void_no_update BEFORE UPDATE ON budget_voids BEGIN SELECT RAISE(ABORT,'budget voids are immutable'); END;
CREATE TRIGGER budget_void_no_delete BEFORE DELETE ON budget_voids BEGIN SELECT RAISE(ABORT,'budget voids are immutable'); END;
