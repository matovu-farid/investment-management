ALTER TABLE policy_targets ADD COLUMN request_key TEXT;
CREATE UNIQUE INDEX policy_targets_request_key_idx ON policy_targets(request_key);
