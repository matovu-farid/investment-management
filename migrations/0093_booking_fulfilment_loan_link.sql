-- A link records a reviewed association; it does not post or establish disbursement.
CREATE TRIGGER fulfilment_loan_link_guard BEFORE INSERT ON credit_booking_fulfilments
WHEN NEW.loan_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM loans l JOIN credit_bookings b ON b.id=NEW.booking_id
  WHERE l.id=NEW.loan_id AND l.member_id=b.member_id AND l.currency=b.currency
    AND l.disbursement_date<=NEW.fulfilment_date
    AND NOT EXISTS(SELECT 1 FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=l.id)
    AND NEW.amount_minor<=l.principal_minor-COALESCE((SELECT sum(f.amount_minor) FROM credit_booking_fulfilments f WHERE f.loan_id=l.id AND NOT EXISTS(SELECT 1 FROM booking_fulfilment_voids v WHERE v.fulfilment_id=f.id)),0)
 ) THEN RAISE(ABORT,'linked loan unavailable, incompatible or already allocated') END;
END;
