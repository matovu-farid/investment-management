-- Existing historical payments have no request key; new payments use a UUID.
ALTER TABLE loan_repayments ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX loan_repayment_key_idx ON loan_repayments(idempotency_key);
