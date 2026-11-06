-- Validate business dates at the database boundary, including later parent edits.
CREATE TRIGGER repayment_date_insert BEFORE INSERT ON loan_repayments
WHEN EXISTS (SELECT 1 FROM loans WHERE id=NEW.loan_id AND NEW.payment_date < disbursement_date)
BEGIN SELECT RAISE(ABORT,'repayment date before disbursement'); END;
CREATE TRIGGER repayment_date_update BEFORE UPDATE OF loan_id,payment_date ON loan_repayments
WHEN EXISTS (SELECT 1 FROM loans WHERE id=NEW.loan_id AND NEW.payment_date < disbursement_date)
BEGIN SELECT RAISE(ABORT,'repayment date before disbursement'); END;
CREATE TRIGGER loan_date_update BEFORE UPDATE OF disbursement_date ON loans
WHEN EXISTS (SELECT 1 FROM loan_repayments WHERE loan_id=OLD.id AND payment_date < NEW.disbursement_date)
BEGIN SELECT RAISE(ABORT,'disbursement date after repayment'); END;
CREATE TRIGGER fulfilment_date_insert BEFORE INSERT ON credit_booking_fulfilments
WHEN EXISTS (SELECT 1 FROM credit_bookings WHERE id=NEW.booking_id AND NEW.fulfilment_date < requested_date)
BEGIN SELECT RAISE(ABORT,'fulfilment date before request'); END;
CREATE TRIGGER booking_date_update BEFORE UPDATE OF requested_date ON credit_bookings
WHEN EXISTS (SELECT 1 FROM credit_booking_fulfilments WHERE booking_id=OLD.id AND fulfilment_date < NEW.requested_date)
BEGIN SELECT RAISE(ABORT,'request date after fulfilment'); END;
