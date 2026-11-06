-- A member's interest is an auditable request, not an allocation or settlement.
CREATE TABLE member_sale_interest_requests (
 id TEXT PRIMARY KEY NOT NULL,
 announcement_id TEXT NOT NULL REFERENCES share_sale_announcements(id),
 member_id TEXT NOT NULL REFERENCES members(id),
 actor_id TEXT NOT NULL REFERENCES "user"(id),
 shares INTEGER NOT NULL CHECK(typeof(shares)='integer' AND shares BETWEEN 1 AND 9007199254740991),
 interest_date TEXT NOT NULL DEFAULT (date('now','+3 hours')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 request_key TEXT NOT NULL UNIQUE
);
CREATE TRIGGER member_interest_guard BEFORE INSERT ON member_sale_interest_requests BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM share_sale_announcements a
  JOIN share_sale_requests s ON s.id=a.sale_id
  JOIN member_user_links l ON l.user_id=NEW.actor_id AND l.member_id=NEW.member_id AND l.revoked_at IS NULL
  JOIN members m ON m.id=l.member_id AND m.status='active'
  WHERE a.id=NEW.announcement_id AND a.withdrawn_at IS NULL
    AND s.member_id<>NEW.member_id AND s.request_date<=date('now','+3 hours')
    AND NEW.interest_date=date('now','+3 hours')
 ) THEN RAISE(ABORT,'interest unavailable') END;
END;
-- Create the existing administrator-visible record atomically with the member request.
CREATE TRIGGER member_interest_register AFTER INSERT ON member_sale_interest_requests BEGIN
 INSERT INTO share_sale_interests(id,sale_id,member_id,interest_date,shares,notes,created_by,request_key)
 SELECT NEW.id,a.sale_id,NEW.member_id,NEW.interest_date,NEW.shares,NULL,NEW.actor_id,'member:'||NEW.id
 FROM share_sale_announcements a WHERE a.id=NEW.announcement_id;
END;
CREATE TRIGGER member_interest_no_update BEFORE UPDATE ON member_sale_interest_requests BEGIN SELECT RAISE(ABORT,'interest is immutable'); END;
CREATE TRIGGER member_interest_no_delete BEFORE DELETE ON member_sale_interest_requests BEGIN SELECT RAISE(ABORT,'interest is immutable'); END;
CREATE INDEX member_interest_actor_idx ON member_sale_interest_requests(actor_id,member_id,created_at);
