-- A grant authorizes one account through one specific active member link.
CREATE TABLE board_packet_access_grants (
 id TEXT PRIMARY KEY NOT NULL,
 packet_id TEXT NOT NULL REFERENCES board_packets(id),
 user_id TEXT NOT NULL REFERENCES "user"(id),
 link_id TEXT NOT NULL REFERENCES member_user_links(id),
 member_id TEXT NOT NULL REFERENCES members(id),
 request_key TEXT NOT NULL UNIQUE,
 granted_by TEXT NOT NULL REFERENCES "user"(id),
 granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE board_packet_access_revocations (
 id TEXT PRIMARY KEY NOT NULL,
 grant_id TEXT NOT NULL UNIQUE REFERENCES board_packet_access_grants(id),
 request_key TEXT NOT NULL UNIQUE,
 revoked_by TEXT NOT NULL REFERENCES "user"(id),
 revoked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER board_packet_access_grant_validate BEFORE INSERT ON board_packet_access_grants BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.granted_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM member_user_links l JOIN members m ON m.id=l.member_id WHERE l.id=NEW.link_id AND l.user_id=NEW.user_id AND l.member_id=NEW.member_id AND l.revoked_at IS NULL AND m.status='active') THEN RAISE(ABORT,'member link unavailable') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM board_packet_access_grants g WHERE g.packet_id=NEW.packet_id AND g.link_id=NEW.link_id AND NOT EXISTS(SELECT 1 FROM board_packet_access_revocations r WHERE r.grant_id=g.id)) THEN RAISE(ABORT,'packet already shared with this link') END;
END;
CREATE TRIGGER board_packet_access_revoke_validate BEFORE INSERT ON board_packet_access_revocations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.revoked_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
END;
CREATE TRIGGER board_packet_access_grant_no_update BEFORE UPDATE ON board_packet_access_grants BEGIN SELECT RAISE(ABORT,'grant history immutable'); END;
CREATE TRIGGER board_packet_access_grant_no_delete BEFORE DELETE ON board_packet_access_grants BEGIN SELECT RAISE(ABORT,'grant history immutable'); END;
CREATE TRIGGER board_packet_access_revoke_no_update BEFORE UPDATE ON board_packet_access_revocations BEGIN SELECT RAISE(ABORT,'revocation history immutable'); END;
CREATE TRIGGER board_packet_access_revoke_no_delete BEFORE DELETE ON board_packet_access_revocations BEGIN SELECT RAISE(ABORT,'revocation history immutable'); END;
