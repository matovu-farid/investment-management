-- An explicit recorded-now correction; no transition or approval policy is inferred.
ALTER TABLE credit_bookings ADD COLUMN status_revision INTEGER NOT NULL DEFAULT 0;
CREATE TABLE booking_status_changes (
 id TEXT PRIMARY KEY NOT NULL, booking_id TEXT NOT NULL REFERENCES credit_bookings(id),
 previous_status TEXT NOT NULL CHECK(previous_status IN ('waiting','held','closed','cancelled')),
 new_status TEXT NOT NULL CHECK(new_status IN ('waiting','held','closed','cancelled')),
 expected_revision INTEGER NOT NULL CHECK(expected_revision>=0),
 member_id TEXT NOT NULL REFERENCES members(id), member_number TEXT NOT NULL, member_name TEXT NOT NULL,
 requested_minor INTEGER NOT NULL, currency TEXT NOT NULL, requested_date TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 450), request_key TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL REFERENCES "user"(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(booking_id,expected_revision), CHECK(previous_status<>new_status)
);
CREATE TRIGGER booking_status_change_validate BEFORE INSERT ON booking_status_changes BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM credit_bookings b JOIN members m ON m.id=b.member_id WHERE b.id=NEW.booking_id AND b.status=NEW.previous_status AND b.status_revision=NEW.expected_revision AND m.id=NEW.member_id AND m.member_number=NEW.member_number AND m.full_name=NEW.member_name AND b.requested_minor=NEW.requested_minor AND b.currency=NEW.currency AND b.requested_date=NEW.requested_date) THEN RAISE(ABORT,'booking changed; review again') END;
END;
CREATE TRIGGER booking_status_update_guard BEFORE UPDATE OF status,status_revision ON credit_bookings
WHEN NEW.status IS NOT OLD.status OR NEW.status_revision IS NOT OLD.status_revision BEGIN
 SELECT CASE WHEN NEW.status_revision<>OLD.status_revision+1 OR NOT EXISTS(SELECT 1 FROM booking_status_changes c WHERE c.booking_id=OLD.id AND c.expected_revision=OLD.status_revision AND c.previous_status=OLD.status AND c.new_status=NEW.status) THEN RAISE(ABORT,'status change requires audit') END;
END;
CREATE TRIGGER booking_status_change_apply AFTER INSERT ON booking_status_changes BEGIN
 UPDATE credit_bookings SET status=NEW.new_status,status_revision=NEW.expected_revision+1 WHERE id=NEW.booking_id;
END;
CREATE TRIGGER booking_status_change_no_update BEFORE UPDATE ON booking_status_changes BEGIN SELECT RAISE(ABORT,'status history immutable'); END;
CREATE TRIGGER booking_status_change_no_delete BEFORE DELETE ON booking_status_changes BEGIN SELECT RAISE(ABORT,'status history immutable'); END;
