-- Manual, dated indicative values. A value is visible only while its exact parent
-- holding publication remains active; withdrawing/replacing that parent never republishes it.
CREATE TABLE share_value_publications (
 id TEXT PRIMARY KEY NOT NULL, holding_publication_id TEXT NOT NULL REFERENCES holding_observation_publications(id),
 member_id TEXT REFERENCES members(id), joint_holding_id TEXT REFERENCES joint_shareholdings(id),
 observed_date TEXT NOT NULL, shares INTEGER NOT NULL, holding_source TEXT NOT NULL,
 price_date TEXT NOT NULL, price_minor INTEGER NOT NULL CHECK(typeof(price_minor)='integer' AND price_minor BETWEEN 1 AND 9007199254740991),
 currency TEXT NOT NULL CHECK(currency GLOB '[A-Z][A-Z][A-Z]'), basis TEXT NOT NULL CHECK(length(trim(basis)) BETWEEN 1 AND 500), price_source TEXT NOT NULL CHECK(length(trim(price_source)) BETWEEN 1 AND 500),
 published_by TEXT NOT NULL REFERENCES "user"(id), published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, publish_key TEXT NOT NULL UNIQUE,
 withdrawn_by TEXT REFERENCES "user"(id), withdrawn_at TEXT, withdraw_key TEXT UNIQUE,
 CHECK((member_id IS NULL) <> (joint_holding_id IS NULL)),
 CHECK((withdrawn_by IS NULL AND withdrawn_at IS NULL AND withdraw_key IS NULL) OR (withdrawn_by IS NOT NULL AND withdrawn_at IS NOT NULL AND withdraw_key IS NOT NULL))
);
CREATE UNIQUE INDEX share_value_one_active_per_holding ON share_value_publications(holding_publication_id) WHERE withdrawn_at IS NULL;
CREATE TRIGGER share_value_insert_guard BEFORE INSERT ON share_value_publications BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.published_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NEW.price_date>date('now','+3 hours') OR date(NEW.price_date,'+0 days') IS NOT NEW.price_date THEN RAISE(ABORT,'invalid price date') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM holding_observation_publications h WHERE h.id=NEW.holding_publication_id AND h.withdrawn_at IS NULL AND h.member_id IS NEW.member_id AND h.joint_holding_id IS NEW.joint_holding_id AND h.observed_date=NEW.observed_date AND h.shares=NEW.shares AND h.source=NEW.holding_source AND NOT EXISTS(SELECT 1 FROM holding_observation_voids v WHERE v.observation_id=h.observation_id)) THEN RAISE(ABORT,'holding unavailable or changed') END;
END;
CREATE TRIGGER share_value_immutable BEFORE UPDATE ON share_value_publications WHEN
 NEW.id IS NOT OLD.id OR NEW.holding_publication_id IS NOT OLD.holding_publication_id OR NEW.member_id IS NOT OLD.member_id OR NEW.joint_holding_id IS NOT OLD.joint_holding_id OR NEW.observed_date IS NOT OLD.observed_date OR NEW.shares IS NOT OLD.shares OR NEW.holding_source IS NOT OLD.holding_source OR NEW.price_date IS NOT OLD.price_date OR NEW.price_minor IS NOT OLD.price_minor OR NEW.currency IS NOT OLD.currency OR NEW.basis IS NOT OLD.basis OR NEW.price_source IS NOT OLD.price_source OR NEW.published_by IS NOT OLD.published_by OR NEW.published_at IS NOT OLD.published_at OR NEW.publish_key IS NOT OLD.publish_key OR OLD.withdrawn_at IS NOT NULL OR NEW.withdrawn_at IS NULL OR NEW.withdrawn_by IS NULL OR NEW.withdraw_key IS NULL OR NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.withdrawn_by AND role='admin')
BEGIN SELECT RAISE(ABORT,'value is immutable except administrator withdrawal'); END;
CREATE TRIGGER share_value_no_delete BEFORE DELETE ON share_value_publications BEGIN SELECT RAISE(ABORT,'value is immutable'); END;
