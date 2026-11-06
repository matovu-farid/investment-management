-- Corrections retain the original individual or joint share event.
CREATE TABLE share_event_voids (
 id TEXT PRIMARY KEY NOT NULL,
 event_id TEXT NOT NULL UNIQUE REFERENCES share_events(id),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 450),
 request_key TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL REFERENCES "user"(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER share_event_void_validate BEFORE INSERT ON share_event_voids BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM share_events WHERE id=NEW.event_id) THEN RAISE(ABORT,'share event not found') END;
END;
CREATE TRIGGER share_event_void_no_update BEFORE UPDATE ON share_event_voids BEGIN SELECT RAISE(ABORT,'void history immutable'); END;
CREATE TRIGGER share_event_void_no_delete BEFORE DELETE ON share_event_voids BEGIN SELECT RAISE(ABORT,'void history immutable'); END;
CREATE TRIGGER void_share_event_no_update BEFORE UPDATE ON share_events WHEN EXISTS(SELECT 1 FROM share_event_voids WHERE event_id=OLD.id) BEGIN SELECT RAISE(ABORT,'share event void'); END;
CREATE TRIGGER void_share_event_no_delete BEFORE DELETE ON share_events WHEN EXISTS(SELECT 1 FROM share_event_voids WHERE event_id=OLD.id) BEGIN SELECT RAISE(ABORT,'share event void'); END;
