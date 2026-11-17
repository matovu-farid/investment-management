CREATE TABLE staff_invitations (
 id TEXT PRIMARY KEY NOT NULL, token_digest TEXT NOT NULL UNIQUE CHECK(length(token_digest)=64),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200), email TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','standard')), issued_by TEXT NOT NULL REFERENCES "user"(id),
 created_at INTEGER NOT NULL DEFAULT (unixepoch()), expires_at INTEGER NOT NULL,
 revoked_at INTEGER, revoked_by TEXT REFERENCES "user"(id),
 CHECK(expires_at>created_at AND expires_at<=created_at+86400),
 CHECK((revoked_at IS NULL)=(revoked_by IS NULL))
);
CREATE TABLE staff_invitation_claims (
 invitation_id TEXT PRIMARY KEY NOT NULL REFERENCES staff_invitations(id),
 user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) DEFERRABLE INITIALLY DEFERRED,
 claimed_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TRIGGER staff_invitation_issue_guard BEFORE INSERT ON staff_invitations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.issued_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM "user" WHERE lower(email)=NEW.email) THEN RAISE(ABORT,'email unavailable') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM staff_invitations i WHERE i.email=NEW.email AND i.revoked_at IS NULL AND i.expires_at>unixepoch() AND NOT EXISTS(SELECT 1 FROM staff_invitation_claims c WHERE c.invitation_id=i.id)) OR EXISTS(SELECT 1 FROM member_invitations i WHERE i.email=NEW.email AND i.revoked_at IS NULL AND i.expires_at>unixepoch() AND NOT EXISTS(SELECT 1 FROM member_invitation_claims c WHERE c.invitation_id=i.id)) THEN RAISE(ABORT,'pending invitation exists') END;
END;
CREATE TRIGGER member_staff_invitation_collision BEFORE INSERT ON member_invitations BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM staff_invitations i WHERE i.email=NEW.email AND i.revoked_at IS NULL AND i.expires_at>unixepoch() AND NOT EXISTS(SELECT 1 FROM staff_invitation_claims c WHERE c.invitation_id=i.id)) THEN RAISE(ABORT,'pending invitation exists') END;
END;
CREATE TRIGGER staff_invitation_update_guard BEFORE UPDATE ON staff_invitations WHEN NEW.id IS NOT OLD.id OR NEW.token_digest IS NOT OLD.token_digest OR NEW.name IS NOT OLD.name OR NEW.email IS NOT OLD.email OR NEW.role IS NOT OLD.role OR NEW.issued_by IS NOT OLD.issued_by OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR NEW.revoked_by IS NULL OR NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.revoked_by AND role='admin') OR EXISTS(SELECT 1 FROM staff_invitation_claims WHERE invitation_id=OLD.id) BEGIN SELECT RAISE(ABORT,'invitation cannot be changed'); END;
CREATE TRIGGER staff_invitation_no_delete BEFORE DELETE ON staff_invitations BEGIN SELECT RAISE(ABORT,'invitation history immutable'); END;
CREATE TRIGGER staff_invitation_claim_guard BEFORE INSERT ON staff_invitation_claims BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM staff_invitations i WHERE i.id=NEW.invitation_id AND i.revoked_at IS NULL AND i.expires_at>unixepoch() AND NOT EXISTS(SELECT 1 FROM "user" u WHERE lower(u.email)=i.email)) THEN RAISE(ABORT,'invitation unavailable') END;
END;
CREATE TRIGGER staff_invitation_claim_no_update BEFORE UPDATE ON staff_invitation_claims BEGIN SELECT RAISE(ABORT,'claims immutable'); END;
CREATE TRIGGER staff_invitation_claim_no_delete BEFORE DELETE ON staff_invitation_claims BEGIN SELECT RAISE(ABORT,'claims immutable'); END;
