-- Source-attributed budget facts only; no accounting or approval implication.
CREATE TABLE budget_lines (
 id TEXT PRIMARY KEY NOT NULL,
 category TEXT NOT NULL CHECK(length(trim(category)) BETWEEN 1 AND 100),
 period_start TEXT NOT NULL CHECK(period_start GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 period_end TEXT NOT NULL CHECK(period_end GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND period_end>=period_start),
 currency TEXT NOT NULL CHECK(currency GLOB '[A-Z][A-Z][A-Z]'),
 amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor)='integer' AND amount_minor BETWEEN 0 AND 9007199254740991),
 source TEXT NOT NULL CHECK(length(trim(source)) BETWEEN 1 AND 500),
 created_by TEXT NOT NULL REFERENCES "user"(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 request_key TEXT NOT NULL UNIQUE
);
CREATE TRIGGER budget_admin BEFORE INSERT ON budget_lines WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') BEGIN SELECT RAISE(ABORT,'unauthorized'); END;
CREATE TRIGGER budget_no_update BEFORE UPDATE ON budget_lines BEGIN SELECT RAISE(ABORT,'budget facts are immutable'); END;
CREATE TRIGGER budget_no_delete BEFORE DELETE ON budget_lines BEGIN SELECT RAISE(ABORT,'budget facts are immutable'); END;
