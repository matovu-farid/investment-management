-- Existing records remain intact. New requests supply a unique client request ID.
ALTER TABLE share_events ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX share_events_request_id_idx ON share_events(request_id);
ALTER TABLE joint_shareholdings ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX joint_shareholdings_request_id_idx ON joint_shareholdings(request_id);
