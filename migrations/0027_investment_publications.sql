-- Explicitly published immutable observations. This is not an approved valuation or a financial statement.
CREATE TABLE investment_publications (
 id TEXT PRIMARY KEY NOT NULL,
 valuation_id TEXT NOT NULL REFERENCES investment_valuations(id),
 investment_id TEXT NOT NULL REFERENCES investments(id),
 name TEXT NOT NULL, asset_class TEXT NOT NULL, currency TEXT NOT NULL,
 valuation_date TEXT NOT NULL, amount_minor INTEGER NOT NULL, basis TEXT NOT NULL, source TEXT,
 published_by TEXT NOT NULL REFERENCES "user"(id), published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 publish_key TEXT NOT NULL UNIQUE, withdrawn_by TEXT REFERENCES "user"(id), withdrawn_at TEXT, withdraw_key TEXT UNIQUE,
 CHECK((withdrawn_by IS NULL AND withdrawn_at IS NULL AND withdraw_key IS NULL) OR (withdrawn_by IS NOT NULL AND withdrawn_at IS NOT NULL AND withdraw_key IS NOT NULL))
);
CREATE UNIQUE INDEX investment_publication_active ON investment_publications(investment_id) WHERE withdrawn_at IS NULL;
CREATE TRIGGER investment_publication_validate BEFORE INSERT ON investment_publications BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM app_user_roles WHERE user_id=NEW.published_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM investment_valuations v JOIN investments i ON i.id=v.investment_id WHERE v.id=NEW.valuation_id AND i.id=NEW.investment_id AND v.valuation_date<=date('now','+3 hours') AND i.name=NEW.name AND i.asset_class=NEW.asset_class AND v.currency=NEW.currency AND v.valuation_date=NEW.valuation_date AND v.amount_minor=NEW.amount_minor AND v.basis=NEW.basis AND v.source IS NEW.source) THEN RAISE(ABORT,'invalid observation') END;
END;
CREATE TRIGGER investment_publication_immutable BEFORE UPDATE ON investment_publications
WHEN NEW.id IS NOT OLD.id OR NEW.valuation_id IS NOT OLD.valuation_id OR NEW.investment_id IS NOT OLD.investment_id OR NEW.name IS NOT OLD.name OR NEW.asset_class IS NOT OLD.asset_class OR NEW.currency IS NOT OLD.currency OR NEW.valuation_date IS NOT OLD.valuation_date OR NEW.amount_minor IS NOT OLD.amount_minor OR NEW.basis IS NOT OLD.basis OR NEW.source IS NOT OLD.source OR NEW.published_by IS NOT OLD.published_by OR NEW.published_at IS NOT OLD.published_at OR NEW.publish_key IS NOT OLD.publish_key OR OLD.withdrawn_at IS NOT NULL OR NEW.withdrawn_at IS NULL OR NEW.withdrawn_by IS NULL OR NEW.withdraw_key IS NULL OR NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.withdrawn_by AND role='admin')
BEGIN SELECT RAISE(ABORT,'publication may only be withdrawn by an administrator'); END;
CREATE TRIGGER investment_publication_no_delete BEFORE DELETE ON investment_publications BEGIN SELECT RAISE(ABORT,'publication history is immutable'); END;
