-- Source-backed administrative balances are independent of member access/publication.
CREATE TABLE reported_loan_balances (
 id TEXT PRIMARY KEY NOT NULL,
 loan_id TEXT NOT NULL REFERENCES loans(id), member_id TEXT NOT NULL REFERENCES members(id),
 currency TEXT NOT NULL, disbursement_date TEXT NOT NULL, principal_minor TEXT NOT NULL,
 observed_date TEXT NOT NULL,
 amount_minor TEXT NOT NULL CHECK(length(amount_minor) BETWEEN 1 AND 30 AND amount_minor NOT GLOB '*[^0-9]*' AND (length(amount_minor)=1 OR substr(amount_minor,1,1)<>'0')),
 basis TEXT NOT NULL CHECK(length(trim(basis)) BETWEEN 1 AND 500),
 source TEXT NOT NULL CHECK(length(trim(source)) BETWEEN 1 AND 500),
 request_key TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL REFERENCES "user"(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX reported_loan_balances_loan_date ON reported_loan_balances(loan_id,observed_date,id);
CREATE TRIGGER reported_loan_balance_guard BEFORE INSERT ON reported_loan_balances BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN length(NEW.observed_date)<>10 OR NEW.observed_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR date(NEW.observed_date,'+0 days') IS NOT NEW.observed_date OR NEW.observed_date<NEW.disbursement_date OR NEW.observed_date>date('now','+3 hours') THEN RAISE(ABORT,'invalid date') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM loans l WHERE l.id=NEW.loan_id AND l.member_id=NEW.member_id AND l.currency=NEW.currency AND l.disbursement_date=NEW.disbursement_date AND CAST(l.principal_minor AS TEXT)=NEW.principal_minor AND NOT EXISTS(SELECT 1 FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=l.id)) THEN RAISE(ABORT,'loan unavailable') END;
END;
CREATE TRIGGER reported_loan_balance_no_update BEFORE UPDATE ON reported_loan_balances BEGIN SELECT RAISE(ABORT,'reported balance immutable'); END;
CREATE TRIGGER reported_loan_balance_no_delete BEFORE DELETE ON reported_loan_balances BEGIN SELECT RAISE(ABORT,'reported balance immutable'); END;
CREATE TRIGGER reported_loan_balance_loan_no_update BEFORE UPDATE OF id,member_id,currency,disbursement_date,principal_minor ON loans WHEN EXISTS(SELECT 1 FROM reported_loan_balances WHERE loan_id=OLD.id) AND (NEW.id IS NOT OLD.id OR NEW.member_id IS NOT OLD.member_id OR NEW.currency IS NOT OLD.currency OR NEW.disbursement_date IS NOT OLD.disbursement_date OR NEW.principal_minor IS NOT OLD.principal_minor) BEGIN SELECT RAISE(ABORT,'reported balance loan immutable'); END;
CREATE TRIGGER reported_loan_balance_loan_no_delete BEFORE DELETE ON loans WHEN EXISTS(SELECT 1 FROM reported_loan_balances WHERE loan_id=OLD.id) BEGIN SELECT RAISE(ABORT,'reported balance loan immutable'); END;
CREATE TABLE reported_loan_balance_voids (
 id TEXT PRIMARY KEY NOT NULL, observation_id TEXT NOT NULL UNIQUE REFERENCES reported_loan_balances(id),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500), request_key TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL REFERENCES "user"(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER reported_loan_balance_void_guard BEFORE INSERT ON reported_loan_balance_voids BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM reported_loan_balances WHERE id=NEW.observation_id) THEN RAISE(ABORT,'observation unavailable') END;
END;
CREATE TRIGGER reported_loan_balance_void_no_update BEFORE UPDATE ON reported_loan_balance_voids BEGIN SELECT RAISE(ABORT,'reported balance void immutable'); END;
CREATE TRIGGER reported_loan_balance_void_no_delete BEFORE DELETE ON reported_loan_balance_voids BEGIN SELECT RAISE(ABORT,'reported balance void immutable'); END;
