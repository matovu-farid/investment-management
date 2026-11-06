CREATE TABLE board_packet_previews (
 id TEXT PRIMARY KEY NOT NULL, created_by TEXT NOT NULL REFERENCES "user"(id),
 packet TEXT NOT NULL CHECK(json_valid(packet)), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE board_packets (
 id TEXT PRIMARY KEY NOT NULL, preview_id TEXT NOT NULL REFERENCES board_packet_previews(id),
 request_key TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL REFERENCES "user"(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER board_preview_admin BEFORE INSERT ON board_packet_previews BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
END;
CREATE TRIGGER board_packet_admin BEFORE INSERT ON board_packets BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') OR NOT EXISTS(SELECT 1 FROM board_packet_previews WHERE id=NEW.preview_id AND created_by=NEW.created_by AND created_at>=datetime('now','-1 day')) THEN RAISE(ABORT,'unauthorized or expired preview') END;
END;
CREATE TRIGGER board_preview_no_update BEFORE UPDATE ON board_packet_previews BEGIN SELECT RAISE(ABORT,'preview immutable'); END;
CREATE TRIGGER board_preview_no_delete BEFORE DELETE ON board_packet_previews WHEN OLD.created_at >= datetime('now','-1 day') OR EXISTS(SELECT 1 FROM board_packets WHERE preview_id=OLD.id) BEGIN SELECT RAISE(ABORT,'preview immutable'); END;
CREATE TRIGGER board_packet_no_update BEFORE UPDATE ON board_packets BEGIN SELECT RAISE(ABORT,'packet immutable'); END;
CREATE TRIGGER board_packet_no_delete BEFORE DELETE ON board_packets BEGIN SELECT RAISE(ABORT,'packet immutable'); END;
