CREATE TABLE book_publications (
 id TEXT PRIMARY KEY NOT NULL,
 as_of TEXT NOT NULL,
 evidence TEXT NOT NULL,
 snapshot TEXT NOT NULL,
 snapshot_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 published_by TEXT NOT NULL,
 publish_key TEXT NOT NULL UNIQUE,
 withdrawn_at TEXT, withdrawn_by TEXT, withdraw_key TEXT UNIQUE,
 CHECK ((withdrawn_at IS NULL AND withdrawn_by IS NULL AND withdraw_key IS NULL) OR (withdrawn_at IS NOT NULL AND withdrawn_by IS NOT NULL AND withdraw_key IS NOT NULL))
);
CREATE TRIGGER book_publication_insert_guard BEFORE INSERT ON book_publications BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.published_by AND role='admin') OR NEW.withdrawn_at IS NOT NULL OR NEW.withdrawn_by IS NOT NULL OR NEW.withdraw_key IS NOT NULL THEN RAISE(ABORT,'unauthorized publication') END;
END;
CREATE TRIGGER book_publication_update_guard BEFORE UPDATE ON book_publications BEGIN
 SELECT CASE WHEN OLD.withdrawn_at IS NOT NULL OR NEW.id IS NOT OLD.id OR NEW.as_of IS NOT OLD.as_of OR NEW.evidence IS NOT OLD.evidence OR NEW.snapshot IS NOT OLD.snapshot OR NEW.snapshot_at IS NOT OLD.snapshot_at OR NEW.published_at IS NOT OLD.published_at OR NEW.published_by IS NOT OLD.published_by OR NEW.publish_key IS NOT OLD.publish_key OR NEW.withdrawn_at IS NULL OR NEW.withdraw_key IS NULL OR NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.withdrawn_by AND role='admin') THEN RAISE(ABORT,'publication is immutable') END;
END;
CREATE TRIGGER book_publication_no_delete BEFORE DELETE ON book_publications BEGIN SELECT RAISE(ABORT,'publication is immutable'); END;
