-- Existing accounts predate request tracking. New account requests retain their
-- author and key so an uncertain response can be safely retried.
ALTER TABLE ledger_accounts ADD COLUMN idempotency_key TEXT;
ALTER TABLE ledger_accounts ADD COLUMN request_actor TEXT REFERENCES "user"(id);
CREATE UNIQUE INDEX ledger_accounts_request_key ON ledger_accounts(idempotency_key);
