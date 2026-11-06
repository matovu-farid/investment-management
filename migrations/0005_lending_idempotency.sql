-- Existing records have no key. New application writes supply UUID request keys.
ALTER TABLE loans ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX loans_idempotency_key_idx ON loans(idempotency_key);
ALTER TABLE credit_bookings ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX credit_bookings_idempotency_key_idx ON credit_bookings(idempotency_key);
