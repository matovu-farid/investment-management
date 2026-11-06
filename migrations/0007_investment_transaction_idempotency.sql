ALTER TABLE investment_transactions ADD COLUMN request_key TEXT;
CREATE UNIQUE INDEX investment_transactions_request_key_idx ON investment_transactions(request_key);
