-- Supports as-of booking reports and recorded-completion calculations.
CREATE INDEX booking_fulfilments_by_booking_date ON credit_booking_fulfilments(booking_id,fulfilment_date);
