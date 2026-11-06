CREATE TABLE member_change_events (
 id TEXT PRIMARY KEY NOT NULL, member_id TEXT NOT NULL REFERENCES members(id),
 old_member_number TEXT NOT NULL, old_full_name TEXT NOT NULL, old_email TEXT, old_status TEXT NOT NULL,
 new_member_number TEXT NOT NULL, new_full_name TEXT NOT NULL, new_email TEXT, new_status TEXT NOT NULL CHECK(new_status IN ('active','inactive')),
 expected_link_id TEXT, expected_invitation_ids TEXT NOT NULL CHECK(json_valid(expected_invitation_ids)),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 450), request_key TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL REFERENCES "user"(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER member_change_validate BEFORE INSERT ON member_change_events BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM members m WHERE m.id=NEW.member_id AND m.member_number=NEW.old_member_number AND m.full_name=NEW.old_full_name AND m.email IS NEW.old_email AND m.status=NEW.old_status) THEN RAISE(ABORT,'member changed; review again') END;
 SELECT CASE WHEN (SELECT id FROM member_user_links WHERE member_id=NEW.member_id AND revoked_at IS NULL) IS NOT NEW.expected_link_id THEN RAISE(ABORT,'member link changed; review again') END;
 SELECT CASE WHEN (SELECT COALESCE(json_group_array(id),'[]') FROM (SELECT i.id FROM member_invitations i WHERE i.member_id=NEW.member_id AND i.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM member_invitation_claims c WHERE c.invitation_id=i.id) ORDER BY i.id)) IS NOT NEW.expected_invitation_ids THEN RAISE(ABORT,'invitations changed; review again') END;
END;
CREATE TRIGGER member_change_apply AFTER INSERT ON member_change_events BEGIN
 UPDATE members SET member_number=NEW.new_member_number,full_name=NEW.new_full_name,email=NEW.new_email,status=NEW.new_status WHERE id=NEW.member_id;
 UPDATE member_user_links SET revoked_at=CURRENT_TIMESTAMP,revoked_by=NEW.created_by,revoke_request_key='member-change:'||NEW.id||':'||id WHERE member_id=NEW.member_id AND revoked_at IS NULL AND NEW.old_status IS NOT NEW.new_status;
 UPDATE member_invitations SET revoked_at=unixepoch(),revoked_by=NEW.created_by WHERE member_id=NEW.member_id AND revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM member_invitation_claims c WHERE c.invitation_id=member_invitations.id) AND NEW.old_status IS NOT NEW.new_status;
END;
CREATE TRIGGER member_change_no_update BEFORE UPDATE ON member_change_events BEGIN SELECT RAISE(ABORT,'member changes immutable'); END;
CREATE TRIGGER member_change_no_delete BEFORE DELETE ON member_change_events BEGIN SELECT RAISE(ABORT,'member changes immutable'); END;
CREATE TRIGGER member_link_active_guard BEFORE INSERT ON member_user_links WHEN NOT EXISTS(SELECT 1 FROM members WHERE id=NEW.member_id AND status='active') BEGIN SELECT RAISE(ABORT,'member inactive'); END;
