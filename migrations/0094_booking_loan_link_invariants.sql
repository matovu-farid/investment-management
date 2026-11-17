-- Keep active reviewed booking-to-loan associations consistent after insertion.
CREATE TRIGGER linked_fulfilment_loan_fields_guard
BEFORE UPDATE OF id,member_id,currency,principal_minor,disbursement_date ON loans
WHEN (NEW.id IS NOT OLD.id OR NEW.member_id IS NOT OLD.member_id OR NEW.currency IS NOT OLD.currency OR NEW.principal_minor IS NOT OLD.principal_minor OR NEW.disbursement_date IS NOT OLD.disbursement_date)
 AND EXISTS(SELECT 1 FROM credit_booking_fulfilments f WHERE f.loan_id=OLD.id AND NOT EXISTS(SELECT 1 FROM booking_fulfilment_voids v WHERE v.fulfilment_id=f.id))
BEGIN SELECT RAISE(ABORT,'loan has active linked fulfilments; correct them first'); END;

CREATE TRIGGER linked_fulfilment_booking_fields_guard
BEFORE UPDATE OF id,member_id,currency ON credit_bookings
WHEN (NEW.id IS NOT OLD.id OR NEW.member_id IS NOT OLD.member_id OR NEW.currency IS NOT OLD.currency)
 AND EXISTS(SELECT 1 FROM credit_booking_fulfilments f WHERE f.booking_id=OLD.id AND f.loan_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM booking_fulfilment_voids v WHERE v.fulfilment_id=f.id))
BEGIN SELECT RAISE(ABORT,'booking has active linked fulfilments; correct them first'); END;
