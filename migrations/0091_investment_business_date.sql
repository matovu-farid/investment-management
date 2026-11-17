-- Use the Kampala business date for reviewed investment status changes.
DROP TRIGGER investment_status_event_guard;
CREATE TRIGGER investment_status_event_guard BEFORE INSERT ON investment_status_events BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM investments WHERE id=NEW.investment_id AND status=NEW.old_status) OR (SELECT max(effective_date) FROM investment_status_events WHERE investment_id=NEW.investment_id) IS NOT NEW.expected_last_effective_date OR (SELECT id FROM investment_status_events WHERE investment_id=NEW.investment_id ORDER BY rowid DESC LIMIT 1) IS NOT NEW.expected_last_event_id THEN RAISE(ABORT,'investment changed; review again') END;
 SELECT CASE WHEN NEW.effective_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR date(NEW.effective_date,'+0 days') IS NOT NEW.effective_date OR NEW.effective_date>date('now','+3 hours') OR (NEW.expected_last_effective_date IS NOT NULL AND NEW.effective_date<NEW.expected_last_effective_date) THEN RAISE(ABORT,'invalid effective date') END;
END;
