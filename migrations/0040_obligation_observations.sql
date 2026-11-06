-- Dated source facts only: these rows do not establish a current balance or post accounting.
CREATE TABLE obligation_observations (
 id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('borrowing','deposit')),
 member_id TEXT REFERENCES members(id), creditor TEXT,
 observed_date TEXT NOT NULL CHECK(observed_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 amount_minor TEXT NOT NULL CHECK(length(amount_minor) BETWEEN 1 AND 30 AND amount_minor NOT GLOB '*[^0-9]*' AND (amount_minor='0' OR substr(amount_minor,1,1)<>'0')),
 currency TEXT NOT NULL CHECK(currency GLOB '[A-Z][A-Z][A-Z]'),
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 450),
 source TEXT NOT NULL CHECK(length(trim(source)) BETWEEN 1 AND 450),
 request_key TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((kind='deposit' AND member_id IS NOT NULL AND creditor IS NULL) OR (kind='borrowing' AND member_id IS NULL AND creditor IS NOT NULL AND length(trim(creditor)) BETWEEN 1 AND 200))
);
CREATE TRIGGER obligation_insert_guard BEFORE INSERT ON obligation_observations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NEW.kind='deposit' AND NOT EXISTS(SELECT 1 FROM members WHERE id=NEW.member_id AND status='active') THEN RAISE(ABORT,'active member required') END;
END;
CREATE TRIGGER obligation_no_update BEFORE UPDATE ON obligation_observations BEGIN SELECT RAISE(ABORT,'observation immutable'); END;
CREATE TRIGGER obligation_no_delete BEFORE DELETE ON obligation_observations BEGIN SELECT RAISE(ABORT,'observation immutable'); END;
CREATE TABLE obligation_observation_voids (
 id TEXT PRIMARY KEY NOT NULL, observation_id TEXT NOT NULL UNIQUE REFERENCES obligation_observations(id),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 450), request_key TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER obligation_void_guard BEFORE INSERT ON obligation_observation_voids BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM obligation_observations WHERE id=NEW.observation_id) THEN RAISE(ABORT,'observation not found') END;
END;
CREATE TRIGGER obligation_void_no_update BEFORE UPDATE ON obligation_observation_voids BEGIN SELECT RAISE(ABORT,'void immutable'); END;
CREATE TRIGGER obligation_void_no_delete BEFORE DELETE ON obligation_observation_voids BEGIN SELECT RAISE(ABORT,'void immutable'); END;
