-- Invitation secrets are never stored: token_digest is SHA-256 of a random bearer token.
CREATE TABLE member_invitations (
 id TEXT PRIMARY KEY NOT NULL, token_digest TEXT NOT NULL UNIQUE CHECK(length(token_digest)=64),
 member_id TEXT NOT NULL REFERENCES members(id), email TEXT NOT NULL,
 issued_by TEXT NOT NULL REFERENCES "user"(id), created_at INTEGER NOT NULL DEFAULT (unixepoch()),
 expires_at INTEGER NOT NULL, revoked_at INTEGER, revoked_by TEXT REFERENCES "user"(id),
 CHECK(expires_at>created_at AND expires_at<=created_at+86400),
 CHECK((revoked_at IS NULL)=(revoked_by IS NULL))
);
CREATE TABLE member_invitation_claims (
 invitation_id TEXT PRIMARY KEY NOT NULL REFERENCES member_invitations(id),
 user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) DEFERRABLE INITIALLY DEFERRED,
 claimed_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE invitation_rate_limits (key TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL, window_start INTEGER NOT NULL);
CREATE TRIGGER invitation_issue_guard BEFORE INSERT ON member_invitations BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM app_user_roles WHERE user_id=NEW.issued_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM members WHERE id=NEW.member_id AND status='active') OR EXISTS (SELECT 1 FROM member_user_links WHERE member_id=NEW.member_id AND revoked_at IS NULL) THEN RAISE(ABORT,'member unavailable') END;
 SELECT CASE WHEN EXISTS (SELECT 1 FROM "user" WHERE lower(email)=NEW.email) THEN RAISE(ABORT,'email unavailable') END;
 SELECT CASE WHEN EXISTS (SELECT 1 FROM member_invitations i WHERE (i.member_id=NEW.member_id OR i.email=NEW.email) AND i.revoked_at IS NULL AND i.expires_at>unixepoch() AND NOT EXISTS (SELECT 1 FROM member_invitation_claims c WHERE c.invitation_id=i.id)) THEN RAISE(ABORT,'pending invitation exists') END;
END;
CREATE TRIGGER invitation_update_guard BEFORE UPDATE ON member_invitations
WHEN NEW.id IS NOT OLD.id OR NEW.token_digest IS NOT OLD.token_digest OR NEW.member_id IS NOT OLD.member_id OR NEW.email IS NOT OLD.email OR NEW.issued_by IS NOT OLD.issued_by OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR NEW.revoked_by IS NULL OR EXISTS(SELECT 1 FROM member_invitation_claims WHERE invitation_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'invitation cannot be changed'); END;
CREATE TRIGGER invitation_no_delete BEFORE DELETE ON member_invitations BEGIN SELECT RAISE(ABORT,'invitation history is immutable'); END;
CREATE TRIGGER invitation_claim_guard BEFORE INSERT ON member_invitation_claims BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM member_invitations i JOIN members m ON m.id=i.member_id AND m.status='active' WHERE i.id=NEW.invitation_id AND i.revoked_at IS NULL AND i.expires_at>unixepoch() AND NOT EXISTS(SELECT 1 FROM member_user_links l WHERE l.member_id=i.member_id AND l.revoked_at IS NULL) AND NOT EXISTS(SELECT 1 FROM "user" u WHERE lower(u.email)=i.email)) THEN RAISE(ABORT,'invitation unavailable') END;
END;
CREATE TRIGGER invitation_claim_no_update BEFORE UPDATE ON member_invitation_claims BEGIN SELECT RAISE(ABORT,'claims are immutable'); END;
CREATE TRIGGER invitation_claim_no_delete BEFORE DELETE ON member_invitation_claims BEGIN SELECT RAISE(ABORT,'claims are immutable'); END;
