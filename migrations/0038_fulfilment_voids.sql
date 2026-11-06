CREATE TABLE booking_fulfilment_voids (
 id TEXT PRIMARY KEY NOT NULL,
 fulfilment_id TEXT NOT NULL UNIQUE REFERENCES credit_booking_fulfilments(id),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 450),
 request_key TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER booking_fulfilment_void_guard BEFORE INSERT ON booking_fulfilment_voids BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM credit_booking_fulfilments WHERE id=NEW.fulfilment_id) THEN RAISE(ABORT,'fulfilment not found') END;
END;
CREATE TRIGGER booking_fulfilment_void_no_update BEFORE UPDATE ON booking_fulfilment_voids BEGIN SELECT RAISE(ABORT,'void history immutable'); END;
CREATE TRIGGER booking_fulfilment_void_no_delete BEFORE DELETE ON booking_fulfilment_voids BEGIN SELECT RAISE(ABORT,'void history immutable'); END;
DROP TRIGGER fulfilment_check_insert;
CREATE TRIGGER fulfilment_check_insert BEFORE INSERT ON credit_booking_fulfilments BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM credit_bookings WHERE id=NEW.booking_id AND status IN ('waiting','held')) THEN RAISE(ABORT,'booking is not open') END;
 SELECT CASE WHEN NEW.amount_minor > (SELECT requested_minor - COALESCE((SELECT sum(f.amount_minor) FROM credit_booking_fulfilments f WHERE f.booking_id=NEW.booking_id AND NOT EXISTS (SELECT 1 FROM booking_fulfilment_voids v WHERE v.fulfilment_id=f.id)),0) FROM credit_bookings WHERE id=NEW.booking_id) THEN RAISE(ABORT,'fulfilment exceeds requested amount') END;
END;
DROP TRIGGER booking_requested_not_below_fulfilled;
CREATE TRIGGER booking_requested_not_below_fulfilled BEFORE UPDATE OF requested_minor ON credit_bookings
WHEN NEW.requested_minor < COALESCE((SELECT sum(f.amount_minor) FROM credit_booking_fulfilments f WHERE f.booking_id=OLD.id AND NOT EXISTS (SELECT 1 FROM booking_fulfilment_voids v WHERE v.fulfilment_id=f.id)),0) BEGIN SELECT RAISE(ABORT,'requested amount below fulfilments'); END;
DROP TRIGGER lending_void_validate;
CREATE TRIGGER lending_void_validate BEFORE INSERT ON loan_source_voids BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN (NEW.source_kind='loan' AND NOT EXISTS(SELECT 1 FROM loans WHERE id=NEW.source_id)) OR (NEW.source_kind='repayment' AND NOT EXISTS(SELECT 1 FROM loan_repayments WHERE id=NEW.source_id)) THEN RAISE(ABORT,'source not found') END;
 SELECT CASE WHEN NEW.source_kind='loan' AND (EXISTS(SELECT 1 FROM loan_repayments r WHERE r.loan_id=NEW.source_id AND NOT EXISTS(SELECT 1 FROM loan_source_voids v WHERE v.source_kind='repayment' AND v.source_id=r.id)) OR EXISTS(SELECT 1 FROM loan_term_changes WHERE loan_id=NEW.source_id) OR EXISTS(SELECT 1 FROM loan_pledges WHERE loan_id=NEW.source_id) OR EXISTS(SELECT 1 FROM loan_recovery_events WHERE loan_id=NEW.source_id) OR EXISTS(SELECT 1 FROM credit_booking_fulfilments f WHERE f.loan_id=NEW.source_id AND NOT EXISTS(SELECT 1 FROM booking_fulfilment_voids v WHERE v.fulfilment_id=f.id))) THEN RAISE(ABORT,'loan has dependent records') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM journal_entries j WHERE ((NEW.source_kind='loan' AND j.source_type='loan-disbursement' AND j.source_id=NEW.source_id) OR (NEW.source_kind='repayment' AND j.source_type='loan-repayment' AND j.source_id=NEW.source_id) OR EXISTS(SELECT 1 FROM journal_corrections c WHERE c.journal_id=j.id AND c.source_kind=NEW.source_kind AND c.source_id=NEW.source_id)) AND (j.status='draft' OR (j.status='posted' AND NOT EXISTS(SELECT 1 FROM journal_entries rev WHERE rev.reverses_entry_id=j.id AND rev.status='posted')))) THEN RAISE(ABORT,'source has active or draft journal') END;
END;
