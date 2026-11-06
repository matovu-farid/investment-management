-- Bind access to the exact account identity reviewed by the administrator.
ALTER TABLE board_packet_access_grants ADD COLUMN reviewed_member_name TEXT NOT NULL DEFAULT '';
ALTER TABLE board_packet_access_grants ADD COLUMN reviewed_member_number TEXT NOT NULL DEFAULT '';
ALTER TABLE board_packet_access_grants ADD COLUMN reviewed_email TEXT NOT NULL DEFAULT '';
CREATE TRIGGER board_packet_access_identity_review BEFORE INSERT ON board_packet_access_grants BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM members m JOIN member_user_links l ON l.member_id=m.id JOIN "user" u ON u.id=l.user_id WHERE l.id=NEW.link_id AND l.user_id=NEW.user_id AND l.member_id=NEW.member_id AND l.revoked_at IS NULL AND m.status='active' AND m.full_name=NEW.reviewed_member_name AND m.member_number=NEW.reviewed_member_number AND u.email=NEW.reviewed_email) THEN RAISE(ABORT,'recipient identity changed; review again') END;
END;
