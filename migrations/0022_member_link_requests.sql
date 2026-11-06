ALTER TABLE member_user_links ADD COLUMN link_request_key TEXT;
ALTER TABLE member_user_links ADD COLUMN revoke_request_key TEXT;
CREATE UNIQUE INDEX member_link_request_key ON member_user_links(link_request_key);
CREATE UNIQUE INDEX member_revoke_request_key ON member_user_links(revoke_request_key);
DROP TRIGGER member_link_no_reassignment;
CREATE TRIGGER member_link_no_reassignment BEFORE UPDATE ON member_user_links
WHEN NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.member_id IS NOT OLD.member_id OR NEW.linked_by IS NOT OLD.linked_by OR NEW.linked_at IS NOT OLD.linked_at OR NEW.link_request_key IS NOT OLD.link_request_key OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR NEW.revoked_by IS NULL OR NEW.revoke_request_key IS NULL
BEGIN SELECT RAISE(ABORT,'member links can only be revoked'); END;
