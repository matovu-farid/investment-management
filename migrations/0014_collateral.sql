-- These are asserted facts, not proof of ownership, enforceability, default or settlement.
CREATE TABLE loan_pledges (
 id TEXT PRIMARY KEY NOT NULL,
 loan_id TEXT NOT NULL REFERENCES loans(id),
 holder TEXT NOT NULL CHECK(length(trim(holder))>0),
 shares INTEGER NOT NULL CHECK(typeof(shares)='integer' AND shares>0 AND shares<=9007199254740991),
 pledged_date TEXT NOT NULL CHECK(pledged_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 reference TEXT, evidence TEXT,
 request_key TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX loan_pledges_loan_idx ON loan_pledges(loan_id,pledged_date);
CREATE TABLE loan_recovery_events (
 id TEXT PRIMARY KEY NOT NULL,
 loan_id TEXT NOT NULL REFERENCES loans(id),
 event_date TEXT NOT NULL CHECK(event_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 description TEXT NOT NULL CHECK(length(trim(description))>0),
 request_key TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX loan_recovery_events_loan_idx ON loan_recovery_events(loan_id,event_date);
CREATE TRIGGER loan_pledges_no_update BEFORE UPDATE ON loan_pledges BEGIN SELECT RAISE(ABORT,'pledges are immutable'); END;
CREATE TRIGGER loan_pledges_no_delete BEFORE DELETE ON loan_pledges BEGIN SELECT RAISE(ABORT,'pledges are immutable'); END;
CREATE TRIGGER loan_recovery_events_no_update BEFORE UPDATE ON loan_recovery_events BEGIN SELECT RAISE(ABORT,'recovery events are immutable'); END;
CREATE TRIGGER loan_recovery_events_no_delete BEFORE DELETE ON loan_recovery_events BEGIN SELECT RAISE(ABORT,'recovery events are immutable'); END;
