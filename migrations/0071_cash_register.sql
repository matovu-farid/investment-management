-- Source facts for other cash activity. No journal posting is inferred.
CREATE TABLE cash_entries (
 id TEXT PRIMARY KEY NOT NULL,
 entry_date TEXT NOT NULL,
 direction TEXT NOT NULL CHECK(direction IN ('receipt','payment')),
 amount_minor TEXT NOT NULL CHECK(length(amount_minor) BETWEEN 1 AND 30 AND amount_minor NOT GLOB '*[^0-9]*' AND substr(amount_minor,1,1) BETWEEN '1' AND '9'),
 currency TEXT NOT NULL CHECK(length(currency)=3 AND currency NOT GLOB '*[^A-Z]*'),
 counterparty TEXT NOT NULL CHECK(length(counterparty)<=200),
 reference TEXT NOT NULL CHECK(length(reference)<=200),
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 450),
 request_key TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX cash_entries_date ON cash_entries(entry_date,id);
CREATE TRIGGER cash_entry_guard BEFORE INSERT ON cash_entries BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN length(NEW.entry_date)<>10 OR NEW.entry_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR date(NEW.entry_date,'+0 days') IS NOT NEW.entry_date THEN RAISE(ABORT,'invalid date') END;
END;
CREATE TRIGGER cash_entry_no_update BEFORE UPDATE ON cash_entries BEGIN SELECT RAISE(ABORT,'cash entry immutable'); END;
CREATE TRIGGER cash_entry_no_delete BEFORE DELETE ON cash_entries BEGIN SELECT RAISE(ABORT,'cash entry immutable'); END;
CREATE TABLE cash_entry_voids (
 id TEXT PRIMARY KEY NOT NULL,
 entry_id TEXT NOT NULL UNIQUE REFERENCES cash_entries(id),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 450),
 request_key TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER cash_void_guard BEFORE INSERT ON cash_entry_voids BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM cash_entries WHERE id=NEW.entry_id) THEN RAISE(ABORT,'cash entry not found') END;
END;
CREATE TRIGGER cash_void_no_update BEFORE UPDATE ON cash_entry_voids BEGIN SELECT RAISE(ABORT,'cash void immutable'); END;
CREATE TRIGGER cash_void_no_delete BEFORE DELETE ON cash_entry_voids BEGIN SELECT RAISE(ABORT,'cash void immutable'); END;
