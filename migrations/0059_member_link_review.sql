-- Explicit links retain the identity reviewed by the administrator. Invitation claims use their own identity checks.
ALTER TABLE member_user_links ADD COLUMN reviewed_user_name TEXT;
ALTER TABLE member_user_links ADD COLUMN reviewed_user_email TEXT;
ALTER TABLE member_user_links ADD COLUMN reviewed_member_name TEXT;
ALTER TABLE member_user_links ADD COLUMN reviewed_member_number TEXT;
CREATE TRIGGER member_link_review_guard BEFORE INSERT ON member_user_links WHEN NEW.link_request_key IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.linked_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM "user" u JOIN members m ON m.id=NEW.member_id AND m.status='active' WHERE u.id=NEW.user_id AND u.name=NEW.reviewed_user_name AND u.email=NEW.reviewed_user_email AND m.full_name=NEW.reviewed_member_name AND m.member_number=NEW.reviewed_member_number) THEN RAISE(ABORT,'identity changed; review again') END;
END;
CREATE TRIGGER member_link_review_immutable BEFORE UPDATE ON member_user_links WHEN NEW.reviewed_user_name IS NOT OLD.reviewed_user_name OR NEW.reviewed_user_email IS NOT OLD.reviewed_user_email OR NEW.reviewed_member_name IS NOT OLD.reviewed_member_name OR NEW.reviewed_member_number IS NOT OLD.reviewed_member_number BEGIN SELECT RAISE(ABORT,'review immutable'); END;
