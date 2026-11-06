-- Source-reported facts only; these records do not calculate available cash or post accounting.
CREATE TABLE fund_availability_observations (
 id TEXT PRIMARY KEY NOT NULL,
 observed_date TEXT NOT NULL CHECK(observed_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(observed_date,'+0 days') IS observed_date),
 amount_minor TEXT NOT NULL CHECK(length(amount_minor) BETWEEN 1 AND 30 AND amount_minor NOT GLOB '*[^0-9]*' AND (amount_minor='0' OR substr(amount_minor,1,1)<>'0')),
 currency TEXT NOT NULL CHECK(currency GLOB '[A-Z][A-Z][A-Z]'),
 basis TEXT NOT NULL CHECK(length(trim(basis)) BETWEEN 1 AND 450),
 source TEXT NOT NULL CHECK(length(trim(source)) BETWEEN 1 AND 450),
 request_key TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL REFERENCES "user"(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER fund_observation_insert_guard BEFORE INSERT ON fund_availability_observations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NEW.observed_date > date('now','+3 hours') THEN RAISE(ABORT,'date cannot be in the future') END;
END;
CREATE TRIGGER fund_observation_no_update BEFORE UPDATE ON fund_availability_observations BEGIN SELECT RAISE(ABORT,'observation immutable'); END;
CREATE TRIGGER fund_observation_no_delete BEFORE DELETE ON fund_availability_observations BEGIN SELECT RAISE(ABORT,'observation immutable'); END;
CREATE TABLE fund_availability_voids (
 id TEXT PRIMARY KEY NOT NULL, observation_id TEXT NOT NULL UNIQUE REFERENCES fund_availability_observations(id),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 450), request_key TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL REFERENCES "user"(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER fund_void_guard BEFORE INSERT ON fund_availability_voids BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM fund_availability_observations WHERE id=NEW.observation_id) THEN RAISE(ABORT,'observation not found') END;
END;
CREATE TRIGGER fund_void_no_update BEFORE UPDATE ON fund_availability_voids BEGIN SELECT RAISE(ABORT,'void immutable'); END;
CREATE TRIGGER fund_void_no_delete BEFORE DELETE ON fund_availability_voids BEGIN SELECT RAISE(ABORT,'void immutable'); END;
