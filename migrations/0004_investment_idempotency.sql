-- Existing records have NULL request keys and remain unchanged. New mutations
-- provide a client-generated key; uniqueness is enforced atomically by D1.
ALTER TABLE investments ADD COLUMN request_key TEXT;
ALTER TABLE investment_valuations ADD COLUMN request_key TEXT;
CREATE UNIQUE INDEX investments_request_key_idx ON investments(request_key);
CREATE UNIQUE INDEX valuations_request_key_idx ON investment_valuations(request_key);
