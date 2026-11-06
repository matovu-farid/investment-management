-- Anonymous snapshots are published only after an administrator reviews the exact trade facts.
CREATE TABLE trade_publications (
 id TEXT PRIMARY KEY NOT NULL, trade_id TEXT NOT NULL REFERENCES share_trades(id),
 trade_date TEXT NOT NULL, shares INTEGER NOT NULL, price_minor INTEGER NOT NULL, consideration_minor INTEGER NOT NULL, currency TEXT NOT NULL,
 published_by TEXT NOT NULL REFERENCES "user"(id), published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, publish_key TEXT NOT NULL UNIQUE,
 withdrawn_by TEXT REFERENCES "user"(id), withdrawn_at TEXT, withdraw_key TEXT UNIQUE,
 CHECK((withdrawn_by IS NULL AND withdrawn_at IS NULL AND withdraw_key IS NULL) OR (withdrawn_by IS NOT NULL AND withdrawn_at IS NOT NULL AND withdraw_key IS NOT NULL))
);
CREATE UNIQUE INDEX trade_publication_active ON trade_publications(trade_id) WHERE withdrawn_at IS NULL;
CREATE TRIGGER trade_publication_validate BEFORE INSERT ON trade_publications BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.published_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM share_trades t WHERE t.id=NEW.trade_id AND t.trade_date=NEW.trade_date AND t.trade_date<=date('now','+3 hours') AND t.shares=NEW.shares AND t.price_minor=NEW.price_minor AND t.consideration_minor=NEW.consideration_minor AND t.currency=NEW.currency) THEN RAISE(ABORT,'trade changed; review again') END;
END;
CREATE TRIGGER trade_publication_immutable BEFORE UPDATE ON trade_publications
WHEN NEW.id IS NOT OLD.id OR NEW.trade_id IS NOT OLD.trade_id OR NEW.trade_date IS NOT OLD.trade_date OR NEW.shares IS NOT OLD.shares OR NEW.price_minor IS NOT OLD.price_minor OR NEW.consideration_minor IS NOT OLD.consideration_minor OR NEW.currency IS NOT OLD.currency OR NEW.published_by IS NOT OLD.published_by OR NEW.published_at IS NOT OLD.published_at OR NEW.publish_key IS NOT OLD.publish_key OR OLD.withdrawn_at IS NOT NULL OR NEW.withdrawn_at IS NULL OR NEW.withdrawn_by IS NULL OR NEW.withdraw_key IS NULL OR NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.withdrawn_by AND role='admin') BEGIN SELECT RAISE(ABORT,'publication may only be withdrawn by an administrator'); END;
CREATE TRIGGER trade_publication_no_delete BEFORE DELETE ON trade_publications BEGIN SELECT RAISE(ABORT,'publication history immutable'); END;
