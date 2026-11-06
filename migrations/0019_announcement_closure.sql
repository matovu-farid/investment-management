-- Uganda uses Africa/Kampala (UTC+03:00, no daylight-saving changes).
-- A closed/cancelled event is a recorded completed action, never a schedule.
-- Fail the migration rather than silently interpreting any pre-existing future
-- completion event. Operators must review those records before retrying.
CREATE TABLE announcement_closure_preflight (ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO announcement_closure_preflight(ok)
SELECT CASE WHEN EXISTS (SELECT 1 FROM share_sale_status_events WHERE status IN ('closed','cancelled') AND status_date > date('now','+3 hours')) THEN 0 ELSE 1 END;
DROP TABLE announcement_closure_preflight;

-- Reconcile notices whose sales were already closed before this migration.
UPDATE share_sale_announcements
SET withdrawn_by=(SELECT e.created_by FROM share_sale_status_events e WHERE e.sale_id=share_sale_announcements.sale_id AND e.status IN ('closed','cancelled') ORDER BY e.status_date DESC,e.id DESC LIMIT 1),
    withdrawn_at=CURRENT_TIMESTAMP,
    withdraw_key='closure-migration:' || id
WHERE withdrawn_at IS NULL AND EXISTS (SELECT 1 FROM share_sale_status_events e WHERE e.sale_id=share_sale_announcements.sale_id AND e.status IN ('closed','cancelled'));

CREATE TRIGGER sale_completed_no_future BEFORE INSERT ON share_sale_status_events
WHEN NEW.status IN ('closed','cancelled') AND NEW.status_date > date('now','+3 hours')
BEGIN SELECT RAISE(ABORT,'completed status date cannot be in the future'); END;
CREATE TRIGGER sale_completed_withdraw_notice AFTER INSERT ON share_sale_status_events
WHEN NEW.status IN ('closed','cancelled')
BEGIN
 UPDATE share_sale_announcements SET withdrawn_by=NEW.created_by, withdrawn_at=CURRENT_TIMESTAMP, withdraw_key='closure-event:' || NEW.id
 WHERE sale_id=NEW.sale_id AND withdrawn_at IS NULL;
END;
CREATE TRIGGER announcement_no_publish_closed BEFORE INSERT ON share_sale_announcements
WHEN EXISTS (SELECT 1 FROM share_sale_status_events WHERE sale_id=NEW.sale_id AND status IN ('closed','cancelled'))
BEGIN SELECT RAISE(ABORT,'closed or cancelled sale cannot be published'); END;
