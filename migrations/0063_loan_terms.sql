-- Historical source facts. Existing rows remain readable with unknown source and reason.
ALTER TABLE loan_term_changes ADD COLUMN reason TEXT;
ALTER TABLE loan_term_changes ADD COLUMN source TEXT;
ALTER TABLE loan_term_changes ADD COLUMN request_key TEXT;
ALTER TABLE loan_term_changes ADD COLUMN reviewed_member_id TEXT;
ALTER TABLE loan_term_changes ADD COLUMN reviewed_member_number TEXT;
ALTER TABLE loan_term_changes ADD COLUMN reviewed_member_name TEXT;
ALTER TABLE loan_term_changes ADD COLUMN reviewed_principal TEXT;
ALTER TABLE loan_term_changes ADD COLUMN reviewed_currency TEXT;
ALTER TABLE loan_term_changes ADD COLUMN reviewed_disbursement_date TEXT;
ALTER TABLE loan_term_changes ADD COLUMN reviewed_maturity_date TEXT;
ALTER TABLE loan_term_changes ADD COLUMN reviewed_original_terms TEXT;
CREATE UNIQUE INDEX loan_terms_request_key ON loan_term_changes(request_key);
CREATE TRIGGER loan_terms_validate BEFORE INSERT ON loan_term_changes BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN length(trim(NEW.terms)) NOT BETWEEN 1 AND 4000 OR NEW.terms IS NOT trim(NEW.terms) OR NEW.reason IS NULL OR length(trim(NEW.reason)) NOT BETWEEN 1 AND 450 OR NEW.source IS NULL OR length(trim(NEW.source)) NOT BETWEEN 1 AND 450 OR NEW.request_key IS NULL OR date(NEW.effective_date,'+0 days') IS NOT NEW.effective_date THEN RAISE(ABORT,'invalid terms') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM loans l JOIN members m ON m.id=l.member_id WHERE l.id=NEW.loan_id AND l.member_id=NEW.reviewed_member_id AND m.member_number=NEW.reviewed_member_number AND m.full_name=NEW.reviewed_member_name AND CAST(l.principal_minor AS TEXT)=NEW.reviewed_principal AND l.currency=NEW.reviewed_currency AND l.disbursement_date=NEW.reviewed_disbursement_date AND l.maturity_date IS NEW.reviewed_maturity_date AND l.terms=NEW.reviewed_original_terms AND NEW.effective_date>=l.disbursement_date AND NOT EXISTS(SELECT 1 FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=l.id)) THEN RAISE(ABORT,'loan changed or void; review again') END;
END;
CREATE TRIGGER loan_terms_no_update BEFORE UPDATE ON loan_term_changes BEGIN SELECT RAISE(ABORT,'terms history immutable'); END;
CREATE TRIGGER loan_terms_no_delete BEFORE DELETE ON loan_term_changes BEGIN SELECT RAISE(ABORT,'terms history immutable'); END;
