-- Explicitly reviewed documentary links; no transfer, settlement or event is created.
CREATE TABLE trade_reconciliations (
 id TEXT PRIMARY KEY NOT NULL, trade_id TEXT NOT NULL REFERENCES share_trades(id),
 seller_event_id TEXT NOT NULL REFERENCES share_events(id), buyer_event_id TEXT REFERENCES share_events(id),
 reviewed_trade TEXT NOT NULL CHECK(json_valid(reviewed_trade)), reviewed_seller TEXT NOT NULL CHECK(json_valid(reviewed_seller)), reviewed_buyer TEXT CHECK(reviewed_buyer IS NULL OR json_valid(reviewed_buyer)),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 450), request_key TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL REFERENCES "user"(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE trade_reconciliation_revocations (
 id TEXT PRIMARY KEY NOT NULL, link_id TEXT NOT NULL UNIQUE REFERENCES trade_reconciliations(id),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 450), request_key TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL REFERENCES "user"(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trade_reconciliation_validate BEFORE INSERT ON trade_reconciliations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM share_trades t JOIN share_sale_requests s ON s.id=t.sale_id JOIN members sm ON sm.id=s.member_id LEFT JOIN members bm ON bm.id=t.buyer_member_id
  JOIN share_events se ON se.id=NEW.seller_event_id AND se.member_id=s.member_id AND se.event_type='sale' AND se.shares=t.shares
  WHERE t.id=NEW.trade_id AND NOT EXISTS(SELECT 1 FROM share_trade_voids v WHERE v.trade_id=t.id) AND NOT EXISTS(SELECT 1 FROM share_event_voids v WHERE v.event_id=se.id)
   AND json_extract(NEW.reviewed_trade,'$.id')=t.id AND json_extract(NEW.reviewed_trade,'$.sellerId')=sm.id AND json_extract(NEW.reviewed_trade,'$.sellerName')=sm.full_name AND json_extract(NEW.reviewed_trade,'$.sellerNumber')=sm.member_number AND json_extract(NEW.reviewed_trade,'$.buyerType')=t.buyer_type AND json_extract(NEW.reviewed_trade,'$.buyerId') IS t.buyer_member_id AND json_extract(NEW.reviewed_trade,'$.buyerName') IS bm.full_name AND json_extract(NEW.reviewed_trade,'$.buyerNumber') IS bm.member_number AND json_extract(NEW.reviewed_trade,'$.tradeDate')=t.trade_date AND json_extract(NEW.reviewed_trade,'$.shares')=t.shares AND json_extract(NEW.reviewed_trade,'$.currency')=t.currency AND json_extract(NEW.reviewed_trade,'$.priceMinor')=t.price_minor AND json_extract(NEW.reviewed_trade,'$.considerationMinor')=t.consideration_minor AND json_extract(NEW.reviewed_trade,'$.reference') IS t.reference
   AND json_extract(NEW.reviewed_seller,'$.id')=se.id AND json_extract(NEW.reviewed_seller,'$.memberId')=se.member_id AND json_extract(NEW.reviewed_seller,'$.memberName')=sm.full_name AND json_extract(NEW.reviewed_seller,'$.memberNumber')=sm.member_number AND json_extract(NEW.reviewed_seller,'$.eventType')=se.event_type AND json_extract(NEW.reviewed_seller,'$.eventDate')=se.event_date AND json_extract(NEW.reviewed_seller,'$.shares')=se.shares AND json_extract(NEW.reviewed_seller,'$.reference') IS se.reference
   AND ((t.buyer_type='group' AND NEW.buyer_event_id IS NULL AND NEW.reviewed_buyer IS NULL) OR (t.buyer_type='member' AND EXISTS(SELECT 1 FROM share_events be WHERE be.id=NEW.buyer_event_id AND be.member_id=t.buyer_member_id AND be.event_type='purchase' AND be.shares=t.shares AND NOT EXISTS(SELECT 1 FROM share_event_voids v WHERE v.event_id=be.id) AND json_extract(NEW.reviewed_buyer,'$.id')=be.id AND json_extract(NEW.reviewed_buyer,'$.memberId')=be.member_id AND json_extract(NEW.reviewed_buyer,'$.memberName')=bm.full_name AND json_extract(NEW.reviewed_buyer,'$.memberNumber')=bm.member_number AND json_extract(NEW.reviewed_buyer,'$.eventType')=be.event_type AND json_extract(NEW.reviewed_buyer,'$.eventDate')=be.event_date AND json_extract(NEW.reviewed_buyer,'$.shares')=be.shares AND json_extract(NEW.reviewed_buyer,'$.reference') IS be.reference)))
 ) THEN RAISE(ABORT,'trade or events changed or do not match; review again') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM trade_reconciliations l WHERE NOT EXISTS(SELECT 1 FROM trade_reconciliation_revocations r WHERE r.link_id=l.id) AND (l.trade_id=NEW.trade_id OR l.seller_event_id IN (NEW.seller_event_id,NEW.buyer_event_id) OR l.buyer_event_id IN (NEW.seller_event_id,NEW.buyer_event_id))) THEN RAISE(ABORT,'trade or share event already linked') END;
END;
CREATE TRIGGER trade_reconciliation_revoke_validate BEFORE INSERT ON trade_reconciliation_revocations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
END;
CREATE TRIGGER trade_reconciliation_no_update BEFORE UPDATE ON trade_reconciliations BEGIN SELECT RAISE(ABORT,'reconciliation history immutable'); END;
CREATE TRIGGER trade_reconciliation_no_delete BEFORE DELETE ON trade_reconciliations BEGIN SELECT RAISE(ABORT,'reconciliation history immutable'); END;
CREATE TRIGGER trade_reconciliation_revoke_no_update BEFORE UPDATE ON trade_reconciliation_revocations BEGIN SELECT RAISE(ABORT,'reconciliation history immutable'); END;
CREATE TRIGGER trade_reconciliation_revoke_no_delete BEFORE DELETE ON trade_reconciliation_revocations BEGIN SELECT RAISE(ABORT,'reconciliation history immutable'); END;
CREATE TRIGGER trade_reconciliation_trade_void BEFORE INSERT ON share_trade_voids WHEN EXISTS(SELECT 1 FROM trade_reconciliations l WHERE l.trade_id=NEW.trade_id AND NOT EXISTS(SELECT 1 FROM trade_reconciliation_revocations r WHERE r.link_id=l.id)) BEGIN SELECT RAISE(ABORT,'revoke trade reconciliation before void'); END;
CREATE TRIGGER trade_reconciliation_event_void BEFORE INSERT ON share_event_voids WHEN EXISTS(SELECT 1 FROM trade_reconciliations l WHERE (l.seller_event_id=NEW.event_id OR l.buyer_event_id=NEW.event_id) AND NOT EXISTS(SELECT 1 FROM trade_reconciliation_revocations r WHERE r.link_id=l.id)) BEGIN SELECT RAISE(ABORT,'revoke trade reconciliation before void'); END;
CREATE TRIGGER trade_reconciliation_event_update BEFORE UPDATE ON share_events WHEN EXISTS(SELECT 1 FROM trade_reconciliations l WHERE (l.seller_event_id=OLD.id OR l.buyer_event_id=OLD.id) AND NOT EXISTS(SELECT 1 FROM trade_reconciliation_revocations r WHERE r.link_id=l.id)) BEGIN SELECT RAISE(ABORT,'revoke trade reconciliation before changing event'); END;
CREATE TRIGGER trade_reconciliation_event_delete BEFORE DELETE ON share_events WHEN EXISTS(SELECT 1 FROM trade_reconciliations l WHERE (l.seller_event_id=OLD.id OR l.buyer_event_id=OLD.id) AND NOT EXISTS(SELECT 1 FROM trade_reconciliation_revocations r WHERE r.link_id=l.id)) BEGIN SELECT RAISE(ABORT,'revoke trade reconciliation before deleting event'); END;
