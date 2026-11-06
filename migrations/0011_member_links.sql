-- Explicit administrator links; an audited revocation allows safe correction.
CREATE TABLE member_user_links (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  linked_by TEXT NOT NULL REFERENCES "user"(id),
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_by TEXT REFERENCES "user"(id),
  revoked_at TEXT,
  CHECK((revoked_by IS NULL) = (revoked_at IS NULL))
);
CREATE UNIQUE INDEX member_link_active_user ON member_user_links(user_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX member_link_active_member ON member_user_links(member_id) WHERE revoked_at IS NULL;
CREATE TRIGGER member_link_no_reassignment BEFORE UPDATE ON member_user_links
WHEN NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.member_id IS NOT OLD.member_id OR NEW.linked_by IS NOT OLD.linked_by OR NEW.linked_at IS NOT OLD.linked_at OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR NEW.revoked_by IS NULL
BEGIN SELECT RAISE(ABORT,'member links can only be revoked'); END;
CREATE TRIGGER member_link_no_delete BEFORE DELETE ON member_user_links BEGIN SELECT RAISE(ABORT,'member link history cannot be deleted'); END;
