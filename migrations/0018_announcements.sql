-- Publication is an explicit, revocable announcement; it does not execute a sale.
CREATE TABLE share_sale_announcements (
 id TEXT PRIMARY KEY NOT NULL,
 sale_id TEXT NOT NULL REFERENCES share_sale_requests(id),
 published_by TEXT NOT NULL REFERENCES "user"(id),
 published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 publish_key TEXT NOT NULL UNIQUE,
 withdrawn_by TEXT REFERENCES "user"(id),
 withdrawn_at TEXT,
 withdraw_key TEXT UNIQUE,
 CHECK ((withdrawn_by IS NULL AND withdrawn_at IS NULL AND withdraw_key IS NULL) OR (withdrawn_by IS NOT NULL AND withdrawn_at IS NOT NULL AND withdraw_key IS NOT NULL))
);
CREATE UNIQUE INDEX share_announcement_active_sale ON share_sale_announcements(sale_id) WHERE withdrawn_at IS NULL;
CREATE TRIGGER announcement_immutable BEFORE UPDATE ON share_sale_announcements
WHEN NEW.id IS NOT OLD.id OR NEW.sale_id IS NOT OLD.sale_id OR NEW.published_by IS NOT OLD.published_by OR NEW.published_at IS NOT OLD.published_at OR NEW.publish_key IS NOT OLD.publish_key OR OLD.withdrawn_at IS NOT NULL OR NEW.withdrawn_at IS NULL OR NEW.withdrawn_by IS NULL OR NEW.withdraw_key IS NULL
BEGIN SELECT RAISE(ABORT,'announcement may only be withdrawn once'); END;
CREATE TRIGGER announcement_no_delete BEFORE DELETE ON share_sale_announcements BEGIN SELECT RAISE(ABORT,'announcement history is immutable'); END;
