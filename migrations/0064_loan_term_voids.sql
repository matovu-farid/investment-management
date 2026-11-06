-- Preserve original term records and retain explicit, immutable corrections.
CREATE TABLE loan_term_change_voids (
 id TEXT PRIMARY KEY NOT NULL, term_change_id TEXT NOT NULL UNIQUE REFERENCES loan_term_changes(id),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 450), request_key TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL REFERENCES "user"(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER loan_term_void_validate BEFORE INSERT ON loan_term_change_voids BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM loan_term_changes t WHERE t.id=NEW.term_change_id AND NOT EXISTS(SELECT 1 FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=t.loan_id)) THEN RAISE(ABORT,'term change unavailable') END;
END;
CREATE TRIGGER loan_term_void_no_update BEFORE UPDATE ON loan_term_change_voids BEGIN SELECT RAISE(ABORT,'void history immutable'); END;
CREATE TRIGGER loan_term_void_no_delete BEFORE DELETE ON loan_term_change_voids BEGIN SELECT RAISE(ABORT,'void history immutable'); END;
DROP TRIGGER lending_void_validate;
CREATE TRIGGER lending_void_validate BEFORE INSERT ON loan_source_voids BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN (NEW.source_kind='loan' AND NOT EXISTS(SELECT 1 FROM loans WHERE id=NEW.source_id)) OR (NEW.source_kind='repayment' AND NOT EXISTS(SELECT 1 FROM loan_repayments WHERE id=NEW.source_id)) THEN RAISE(ABORT,'source not found') END;
 SELECT CASE WHEN NEW.source_kind='loan' AND (EXISTS(SELECT 1 FROM loan_repayments r WHERE r.loan_id=NEW.source_id AND NOT EXISTS(SELECT 1 FROM loan_source_voids v WHERE v.source_kind='repayment' AND v.source_id=r.id)) OR EXISTS(SELECT 1 FROM loan_term_changes t WHERE t.loan_id=NEW.source_id AND NOT EXISTS(SELECT 1 FROM loan_term_change_voids tv WHERE tv.term_change_id=t.id)) OR EXISTS(SELECT 1 FROM loan_pledges WHERE loan_id=NEW.source_id) OR EXISTS(SELECT 1 FROM loan_recovery_events WHERE loan_id=NEW.source_id) OR EXISTS(SELECT 1 FROM credit_booking_fulfilments f WHERE f.loan_id=NEW.source_id AND NOT EXISTS(SELECT 1 FROM booking_fulfilment_voids v WHERE v.fulfilment_id=f.id))) THEN RAISE(ABORT,'loan has dependent records') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM journal_entries j WHERE ((NEW.source_kind='loan' AND j.source_type='loan-disbursement' AND j.source_id=NEW.source_id) OR (NEW.source_kind='repayment' AND j.source_type='loan-repayment' AND j.source_id=NEW.source_id) OR EXISTS(SELECT 1 FROM journal_corrections c WHERE c.journal_id=j.id AND c.source_kind=NEW.source_kind AND c.source_id=NEW.source_id)) AND (j.status='draft' OR (j.status='posted' AND NOT EXISTS(SELECT 1 FROM journal_entries rev WHERE rev.reverses_entry_id=j.id AND rev.status='posted')))) THEN RAISE(ABORT,'source has active or draft journal') END;
END;
