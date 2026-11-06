-- Posting of any journal is authorized at the database boundary, including manual entries.
CREATE TRIGGER journal_post_requires_admin BEFORE UPDATE OF status ON journal_entries
WHEN NEW.status='posted' AND NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin')
BEGIN SELECT RAISE(ABORT,'unauthorized journal posting'); END;
