-- Dated recorded share positions; no position is inferred from events or apportioned.
CREATE TABLE holding_observations (
 id TEXT PRIMARY KEY NOT NULL, member_id TEXT REFERENCES members(id), joint_holding_id TEXT REFERENCES joint_shareholdings(id),
 observed_date TEXT NOT NULL CHECK(observed_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 shares INTEGER NOT NULL CHECK(typeof(shares)='integer' AND shares BETWEEN 0 AND 9007199254740991),
 source TEXT NOT NULL CHECK(length(trim(source)) BETWEEN 1 AND 500), created_by TEXT NOT NULL REFERENCES "user"(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, request_key TEXT NOT NULL UNIQUE,
 CHECK((member_id IS NOT NULL) <> (joint_holding_id IS NOT NULL))
);
CREATE TRIGGER holding_observation_guard BEFORE INSERT ON holding_observations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NEW.observed_date>date('now','+3 hours') OR date(NEW.observed_date,'+0 days') IS NOT NEW.observed_date THEN RAISE(ABORT,'invalid observation date') END;
 SELECT CASE WHEN NEW.member_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM members WHERE id=NEW.member_id) THEN RAISE(ABORT,'member not found') END;
 SELECT CASE WHEN NEW.joint_holding_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM joint_shareholdings WHERE id=NEW.joint_holding_id) OR (SELECT count(*) FROM joint_shareholding_members WHERE shareholding_id=NEW.joint_holding_id)<2) THEN RAISE(ABORT,'joint holding requires members') END;
END;
CREATE TRIGGER holding_observation_no_update BEFORE UPDATE ON holding_observations BEGIN SELECT RAISE(ABORT,'observation is immutable'); END;
CREATE TRIGGER holding_observation_no_delete BEFORE DELETE ON holding_observations BEGIN SELECT RAISE(ABORT,'observation is immutable'); END;
-- Joint recipients cannot be silently changed after a sourced observation exists.
CREATE TRIGGER observed_joint_no_add BEFORE INSERT ON joint_shareholding_members WHEN EXISTS(SELECT 1 FROM holding_observations WHERE joint_holding_id=NEW.shareholding_id) BEGIN SELECT RAISE(ABORT,'observed joint membership is immutable'); END;
CREATE TRIGGER observed_joint_no_change BEFORE UPDATE ON joint_shareholding_members WHEN EXISTS(SELECT 1 FROM holding_observations WHERE joint_holding_id IN (OLD.shareholding_id,NEW.shareholding_id)) BEGIN SELECT RAISE(ABORT,'observed joint membership is immutable'); END;
CREATE TRIGGER observed_joint_no_remove BEFORE DELETE ON joint_shareholding_members WHEN EXISTS(SELECT 1 FROM holding_observations WHERE joint_holding_id=OLD.shareholding_id) BEGIN SELECT RAISE(ABORT,'observed joint membership is immutable'); END;
CREATE TABLE holding_observation_voids (
 observation_id TEXT PRIMARY KEY NOT NULL REFERENCES holding_observations(id), reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500),
 voided_by TEXT NOT NULL REFERENCES "user"(id), voided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, request_key TEXT NOT NULL UNIQUE
);
CREATE TABLE holding_observation_publications (
 id TEXT PRIMARY KEY NOT NULL, observation_id TEXT NOT NULL REFERENCES holding_observations(id),
 member_id TEXT REFERENCES members(id), joint_holding_id TEXT REFERENCES joint_shareholdings(id),
 observed_date TEXT NOT NULL, shares INTEGER NOT NULL, source TEXT NOT NULL,
 published_by TEXT NOT NULL REFERENCES "user"(id), published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, publish_key TEXT NOT NULL UNIQUE,
 withdrawn_by TEXT REFERENCES "user"(id), withdrawn_at TEXT, withdraw_key TEXT UNIQUE,
 CHECK((member_id IS NOT NULL) <> (joint_holding_id IS NOT NULL)),
 CHECK((withdrawn_by IS NULL AND withdrawn_at IS NULL AND withdraw_key IS NULL) OR (withdrawn_by IS NOT NULL AND withdrawn_at IS NOT NULL AND withdraw_key IS NOT NULL))
);
CREATE UNIQUE INDEX holding_publication_active_member ON holding_observation_publications(member_id) WHERE withdrawn_at IS NULL AND member_id IS NOT NULL;
CREATE UNIQUE INDEX holding_publication_active_joint ON holding_observation_publications(joint_holding_id) WHERE withdrawn_at IS NULL AND joint_holding_id IS NOT NULL;
CREATE TRIGGER holding_void_guard BEFORE INSERT ON holding_observation_voids BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.voided_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM holding_observation_publications WHERE observation_id=NEW.observation_id AND withdrawn_at IS NULL) THEN RAISE(ABORT,'withdraw publication before void') END;
END;
CREATE TRIGGER holding_void_no_update BEFORE UPDATE ON holding_observation_voids BEGIN SELECT RAISE(ABORT,'void is immutable'); END;
CREATE TRIGGER holding_void_no_delete BEFORE DELETE ON holding_observation_voids BEGIN SELECT RAISE(ABORT,'void is immutable'); END;
CREATE TRIGGER holding_publication_guard BEFORE INSERT ON holding_observation_publications BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.published_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM holding_observations o WHERE o.id=NEW.observation_id AND o.member_id IS NEW.member_id AND o.joint_holding_id IS NEW.joint_holding_id AND o.observed_date=NEW.observed_date AND o.shares=NEW.shares AND o.source=NEW.source AND NOT EXISTS(SELECT 1 FROM holding_observation_voids v WHERE v.observation_id=o.id)) THEN RAISE(ABORT,'observation unavailable or changed') END;
END;
CREATE TRIGGER holding_publication_immutable BEFORE UPDATE ON holding_observation_publications
WHEN NEW.id IS NOT OLD.id OR NEW.observation_id IS NOT OLD.observation_id OR NEW.member_id IS NOT OLD.member_id OR NEW.joint_holding_id IS NOT OLD.joint_holding_id OR NEW.observed_date IS NOT OLD.observed_date OR NEW.shares IS NOT OLD.shares OR NEW.source IS NOT OLD.source OR NEW.published_by IS NOT OLD.published_by OR NEW.published_at IS NOT OLD.published_at OR NEW.publish_key IS NOT OLD.publish_key OR OLD.withdrawn_at IS NOT NULL OR NEW.withdrawn_at IS NULL OR NEW.withdrawn_by IS NULL OR NEW.withdraw_key IS NULL OR NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.withdrawn_by AND role='admin')
BEGIN SELECT RAISE(ABORT,'publication may only be withdrawn by administrator'); END;
CREATE TRIGGER holding_publication_no_delete BEFORE DELETE ON holding_observation_publications BEGIN SELECT RAISE(ABORT,'publication is immutable'); END;
