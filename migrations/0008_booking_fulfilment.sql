-- Existing fulfilments remain valid without request keys; new writes use a UUID.
ALTER TABLE credit_booking_fulfilments ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX credit_fulfilment_key_idx ON credit_booking_fulfilments(idempotency_key);
-- SQLite serializes each insert; this check and insert execute as one statement.
CREATE TRIGGER fulfilment_check_insert BEFORE INSERT ON credit_booking_fulfilments BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM credit_bookings WHERE id=NEW.booking_id AND status IN ('waiting','held')) THEN RAISE(ABORT,'booking is not open') END;
  SELECT CASE WHEN NEW.amount_minor > (SELECT requested_minor - COALESCE((SELECT sum(amount_minor) FROM credit_booking_fulfilments WHERE booking_id=NEW.booking_id),0) FROM credit_bookings WHERE id=NEW.booking_id) THEN RAISE(ABORT,'fulfilment exceeds requested amount') END;
END;
CREATE TRIGGER fulfilment_no_update BEFORE UPDATE ON credit_booking_fulfilments BEGIN SELECT RAISE(ABORT,'fulfilments are immutable'); END;
CREATE TRIGGER fulfilment_no_delete BEFORE DELETE ON credit_booking_fulfilments BEGIN SELECT RAISE(ABORT,'fulfilments are immutable'); END;
CREATE TRIGGER booking_requested_not_below_fulfilled BEFORE UPDATE OF requested_minor ON credit_bookings
WHEN NEW.requested_minor < COALESCE((SELECT sum(amount_minor) FROM credit_booking_fulfilments WHERE booking_id=OLD.id),0) BEGIN SELECT RAISE(ABORT,'requested amount below fulfilments'); END;
