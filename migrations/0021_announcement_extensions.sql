-- Publishing an existing extension is a separate, immutable action.
CREATE TABLE share_sale_announcement_extensions (
 id TEXT PRIMARY KEY NOT NULL,
 announcement_id TEXT NOT NULL REFERENCES share_sale_announcements(id),
 event_id TEXT NOT NULL REFERENCES share_sale_status_events(id),
 published_by TEXT NOT NULL REFERENCES "user"(id),
 published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 request_key TEXT NOT NULL UNIQUE,
 UNIQUE (announcement_id, event_id)
);
CREATE TRIGGER announcement_extension_validate BEFORE INSERT ON share_sale_announcement_extensions
WHEN NOT EXISTS (
 SELECT 1 FROM share_sale_announcements a
 JOIN share_sale_status_events e ON e.sale_id=a.sale_id
 WHERE a.id=NEW.announcement_id AND a.withdrawn_at IS NULL AND e.id=NEW.event_id
   AND e.status='extended' AND e.new_deadline_date IS NOT NULL
   AND e.status_date <= date('now','+3 hours')
)
BEGIN SELECT RAISE(ABORT,'active notice and recorded extension required'); END;
CREATE TRIGGER announcement_extension_no_update BEFORE UPDATE ON share_sale_announcement_extensions
BEGIN SELECT RAISE(ABORT,'extension publication is immutable'); END;
CREATE TRIGGER announcement_extension_no_delete BEFORE DELETE ON share_sale_announcement_extensions
BEGIN SELECT RAISE(ABORT,'extension publication is immutable'); END;
