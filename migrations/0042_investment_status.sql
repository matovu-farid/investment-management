-- Dated, factual status changes; neither settlement nor accounting is implied.
CREATE TABLE investment_status_events (
 id TEXT PRIMARY KEY NOT NULL, investment_id TEXT NOT NULL REFERENCES investments(id),
 old_status TEXT NOT NULL CHECK(old_status IN ('active','closed')),
 new_status TEXT NOT NULL CHECK(new_status IN ('active','closed') AND new_status <> old_status),
 expected_last_effective_date TEXT, expected_last_event_id TEXT, effective_date TEXT NOT NULL,
 source TEXT NOT NULL CHECK(length(trim(source)) BETWEEN 1 AND 450),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 450),
 request_key TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL REFERENCES "user"(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER investment_status_event_guard BEFORE INSERT ON investment_status_events BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM investments WHERE id=NEW.investment_id AND status=NEW.old_status) OR (SELECT max(effective_date) FROM investment_status_events WHERE investment_id=NEW.investment_id) IS NOT NEW.expected_last_effective_date OR (SELECT id FROM investment_status_events WHERE investment_id=NEW.investment_id ORDER BY rowid DESC LIMIT 1) IS NOT NEW.expected_last_event_id THEN RAISE(ABORT,'investment changed; review again') END;
 SELECT CASE WHEN NEW.effective_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR date(NEW.effective_date,'+0 days') IS NOT NEW.effective_date OR NEW.effective_date>date('now') OR (NEW.expected_last_effective_date IS NOT NULL AND NEW.effective_date<NEW.expected_last_effective_date) THEN RAISE(ABORT,'invalid effective date') END;
END;
CREATE TRIGGER investment_status_event_apply AFTER INSERT ON investment_status_events BEGIN UPDATE investments SET status=NEW.new_status WHERE id=NEW.investment_id; END;
CREATE TRIGGER investment_status_event_no_update BEFORE UPDATE ON investment_status_events BEGIN SELECT RAISE(ABORT,'status history immutable'); END;
CREATE TRIGGER investment_status_event_no_delete BEFORE DELETE ON investment_status_events BEGIN SELECT RAISE(ABORT,'status history immutable'); END;
