-- Existing invitation identities were not reviewed; pending legacy links require reissue.
ALTER TABLE member_invitations ADD COLUMN reviewed_member_name TEXT;
ALTER TABLE member_invitations ADD COLUMN reviewed_member_number TEXT;
CREATE TABLE invitation_identity_invalidations (invitation_id TEXT PRIMARY KEY REFERENCES member_invitations(id), invalidated_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE TRIGGER invitation_member_identity_changed AFTER UPDATE OF full_name,member_number ON members WHEN NEW.full_name IS NOT OLD.full_name OR NEW.member_number IS NOT OLD.member_number BEGIN
 INSERT OR IGNORE INTO invitation_identity_invalidations(invitation_id) SELECT i.id FROM member_invitations i WHERE i.member_id=OLD.id AND i.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM member_invitation_claims c WHERE c.invitation_id=i.id);
END;
CREATE TRIGGER invitation_identity_invalidation_no_update BEFORE UPDATE ON invitation_identity_invalidations BEGIN SELECT RAISE(ABORT,'invalidation immutable'); END;
CREATE TRIGGER invitation_identity_invalidation_no_delete BEFORE DELETE ON invitation_identity_invalidations BEGIN SELECT RAISE(ABORT,'invalidation immutable'); END;
CREATE TRIGGER invitation_review_validate BEFORE INSERT ON member_invitations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM members m WHERE m.id=NEW.member_id AND m.status='active' AND m.full_name=NEW.reviewed_member_name AND m.member_number=NEW.reviewed_member_number) THEN RAISE(ABORT,'member identity changed; review again') END;
END;
CREATE TRIGGER invitation_review_immutable BEFORE UPDATE ON member_invitations WHEN NEW.reviewed_member_name IS NOT OLD.reviewed_member_name OR NEW.reviewed_member_number IS NOT OLD.reviewed_member_number BEGIN SELECT RAISE(ABORT,'invitation review immutable'); END;
CREATE TRIGGER invitation_claim_review BEFORE INSERT ON member_invitation_claims BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM invitation_identity_invalidations x WHERE x.invitation_id=NEW.invitation_id) OR NOT EXISTS(SELECT 1 FROM member_invitations i JOIN members m ON m.id=i.member_id WHERE i.id=NEW.invitation_id AND m.full_name=i.reviewed_member_name AND m.member_number=i.reviewed_member_number) THEN RAISE(ABORT,'member identity changed; invitation unavailable') END;
END;
