-- Documentary trade facts only; no ownership, settlement or accounting effect.
CREATE TABLE share_trades (
 id TEXT PRIMARY KEY NOT NULL,
 sale_id TEXT NOT NULL REFERENCES share_sale_requests(id),
 buyer_type TEXT NOT NULL CHECK(buyer_type IN ('member','group')),
 buyer_member_id TEXT REFERENCES members(id),
 shares INTEGER NOT NULL CHECK(typeof(shares)='integer' AND shares BETWEEN 1 AND 9007199254740991),
 trade_date TEXT NOT NULL CHECK(trade_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 price_minor INTEGER NOT NULL CHECK(typeof(price_minor)='integer' AND price_minor BETWEEN 1 AND 9007199254740991),
 consideration_minor INTEGER NOT NULL CHECK(typeof(consideration_minor)='integer' AND consideration_minor BETWEEN 1 AND 9007199254740991),
 currency TEXT NOT NULL CHECK(currency GLOB '[A-Z][A-Z][A-Z]'), reference TEXT, notes TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, request_key TEXT NOT NULL UNIQUE,
 CHECK((buyer_type='member' AND buyer_member_id IS NOT NULL) OR (buyer_type='group' AND buyer_member_id IS NULL))
);
CREATE TRIGGER trade_valid BEFORE INSERT ON share_trades BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM share_sale_requests s WHERE s.id=NEW.sale_id AND NEW.trade_date>=s.request_date AND NEW.currency=s.currency AND (NEW.buyer_type='group' OR NEW.buyer_member_id<>s.member_id)) THEN RAISE(ABORT,'invalid sale, trade date, currency or buyer') END;
 SELECT CASE WHEN NEW.buyer_type='member' AND NOT EXISTS(SELECT 1 FROM members WHERE id=NEW.buyer_member_id) THEN RAISE(ABORT,'buyer member not found') END;
END;
CREATE TRIGGER trade_no_update BEFORE UPDATE ON share_trades BEGIN SELECT RAISE(ABORT,'trade facts are immutable'); END;
CREATE TRIGGER trade_no_delete BEFORE DELETE ON share_trades BEGIN SELECT RAISE(ABORT,'trade facts are immutable'); END;
CREATE INDEX share_trades_sale_idx ON share_trades(sale_id,trade_date);
