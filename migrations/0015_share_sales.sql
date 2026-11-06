-- Administrative records only: no ownership, settlement or ledger effect.
CREATE TABLE share_sale_requests (
 id TEXT PRIMARY KEY NOT NULL, member_id TEXT NOT NULL REFERENCES members(id), shares INTEGER NOT NULL CHECK(typeof(shares)='integer' AND shares>0 AND shares<=9007199254740991),
 asking_price_minor INTEGER NOT NULL CHECK(typeof(asking_price_minor)='integer' AND asking_price_minor>0 AND asking_price_minor<=9007199254740991), currency TEXT NOT NULL CHECK(currency GLOB '[A-Z][A-Z][A-Z]'),
 deadline_date TEXT, request_date TEXT NOT NULL CHECK(request_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'), notes TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, request_key TEXT NOT NULL UNIQUE, CHECK(deadline_date IS NULL OR (deadline_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND deadline_date>=request_date))
);
CREATE TABLE share_sale_interests (
 id TEXT PRIMARY KEY NOT NULL, sale_id TEXT NOT NULL REFERENCES share_sale_requests(id), member_id TEXT NOT NULL REFERENCES members(id), interest_date TEXT NOT NULL CHECK(interest_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 shares INTEGER NOT NULL CHECK(typeof(shares)='integer' AND shares>0 AND shares<=9007199254740991), notes TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, request_key TEXT NOT NULL UNIQUE
);
CREATE TABLE share_sale_status_events (
 id TEXT PRIMARY KEY NOT NULL, sale_id TEXT NOT NULL REFERENCES share_sale_requests(id), status_date TEXT NOT NULL CHECK(status_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 new_deadline_date TEXT, status TEXT NOT NULL CHECK(status IN ('announced','extended','closed','cancelled')), notes TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, request_key TEXT NOT NULL UNIQUE
);
CREATE TRIGGER sale_member_active BEFORE INSERT ON share_sale_requests WHEN NOT EXISTS(SELECT 1 FROM members WHERE id=NEW.member_id AND status='active') BEGIN SELECT RAISE(ABORT,'active member required'); END;
CREATE TRIGGER interest_valid BEFORE INSERT ON share_sale_interests BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM members WHERE id=NEW.member_id AND status='active') THEN RAISE(ABORT,'active member required') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM share_sale_requests WHERE id=NEW.sale_id AND (NEW.interest_date<request_date OR NEW.member_id=member_id)) THEN RAISE(ABORT,'invalid interest') END;
END;
CREATE TRIGGER sale_status_date BEFORE INSERT ON share_sale_status_events WHEN EXISTS(SELECT 1 FROM share_sale_requests WHERE id=NEW.sale_id AND NEW.status_date<request_date) BEGIN SELECT RAISE(ABORT,'status date before request'); END;
CREATE TRIGGER sale_status_deadline BEFORE INSERT ON share_sale_status_events WHEN NEW.new_deadline_date IS NOT NULL AND (NEW.status <> 'extended' OR NEW.new_deadline_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR NEW.new_deadline_date < NEW.status_date) BEGIN SELECT RAISE(ABORT,'invalid extension deadline'); END;
CREATE TRIGGER sale_no_update BEFORE UPDATE ON share_sale_requests BEGIN SELECT RAISE(ABORT,'sale facts are immutable'); END;
CREATE TRIGGER sale_no_delete BEFORE DELETE ON share_sale_requests BEGIN SELECT RAISE(ABORT,'sale facts are immutable'); END;
CREATE TRIGGER sale_interest_no_update BEFORE UPDATE ON share_sale_interests BEGIN SELECT RAISE(ABORT,'interest facts are immutable'); END;
CREATE TRIGGER sale_interest_no_delete BEFORE DELETE ON share_sale_interests BEGIN SELECT RAISE(ABORT,'interest facts are immutable'); END;
CREATE TRIGGER sale_status_no_update BEFORE UPDATE ON share_sale_status_events BEGIN SELECT RAISE(ABORT,'status facts are immutable'); END;
CREATE TRIGGER sale_status_no_delete BEFORE DELETE ON share_sale_status_events BEGIN SELECT RAISE(ABORT,'status facts are immutable'); END;
CREATE INDEX share_sale_interest_sale_idx ON share_sale_interests(sale_id,interest_date);
CREATE INDEX share_sale_status_sale_idx ON share_sale_status_events(sale_id,status_date);
