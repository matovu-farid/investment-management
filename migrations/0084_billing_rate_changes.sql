-- Rate changes are reviewed independently from the immutable initial configuration.
CREATE TABLE loan_billing_rate_changes (
 id TEXT PRIMARY KEY, loan_id TEXT NOT NULL REFERENCES loans(id), config_request_key TEXT NOT NULL,
 effective_date TEXT NOT NULL, rate_basis_points INTEGER NOT NULL CHECK(rate_basis_points BETWEEN 0 AND 10000),
 period_days INTEGER NOT NULL CHECK(period_days IN (30,60,180)), reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 450),
 expected_revision INTEGER NOT NULL, request_key TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE loan_billing_rate_change_voids (
 id TEXT PRIMARY KEY, change_id TEXT NOT NULL UNIQUE REFERENCES loan_billing_rate_changes(id), loan_id TEXT NOT NULL REFERENCES loans(id),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 450), expected_revision INTEGER NOT NULL,
 request_key TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER billing_rate_change_validate BEFORE INSERT ON loan_billing_rate_changes BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') OR NOT EXISTS(SELECT 1 FROM loan_billing_revisions WHERE loan_id=NEW.loan_id AND revision=NEW.expected_revision) OR NOT EXISTS(SELECT 1 FROM loan_billing_configs c WHERE c.loan_id=NEW.loan_id AND c.request_key=NEW.config_request_key AND NEW.effective_date>c.disbursement_date AND NOT EXISTS(SELECT 1 FROM loan_source_voids v WHERE v.source_kind='loan' AND v.source_id=c.loan_id)) THEN RAISE(ABORT,'rate review stale or unauthorized') END;
 SELECT CASE WHEN length(NEW.effective_date)<>10 OR date(NEW.effective_date,'+0 days') IS NOT NEW.effective_date OR EXISTS(SELECT 1 FROM loan_openings o WHERE o.loan_id=NEW.loan_id AND NEW.effective_date<=o.opening_date) THEN RAISE(ABORT,'rate date invalid or not after opening') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM loan_billing_rate_changes c WHERE c.loan_id=NEW.loan_id AND c.effective_date=NEW.effective_date AND NOT EXISTS(SELECT 1 FROM loan_billing_rate_change_voids v WHERE v.change_id=c.id)) OR EXISTS(SELECT 1 FROM loan_billing_events e WHERE e.loan_id=NEW.loan_id AND e.event_date>=NEW.effective_date AND NOT EXISTS(SELECT 1 FROM loan_billing_event_voids v WHERE v.event_id=e.id AND v.status='final')) THEN RAISE(ABORT,'rate date already used or finalized billing requires correction') END;
END;
CREATE TRIGGER billing_rate_change_revision AFTER INSERT ON loan_billing_rate_changes BEGIN UPDATE loan_billing_revisions SET revision=revision+1 WHERE loan_id=NEW.loan_id; END;
CREATE TRIGGER billing_rate_change_no_update BEFORE UPDATE ON loan_billing_rate_changes BEGIN SELECT RAISE(ABORT,'rate change immutable'); END;
CREATE TRIGGER billing_rate_change_no_delete BEFORE DELETE ON loan_billing_rate_changes BEGIN SELECT RAISE(ABORT,'rate change immutable'); END;
CREATE TRIGGER billing_rate_void_validate BEFORE INSERT ON loan_billing_rate_change_voids BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') OR NOT EXISTS(SELECT 1 FROM loan_billing_revisions WHERE loan_id=NEW.loan_id AND revision=NEW.expected_revision) OR NOT EXISTS(SELECT 1 FROM loan_billing_rate_changes c JOIN loan_billing_configs b ON b.loan_id=c.loan_id AND b.request_key=c.config_request_key WHERE c.id=NEW.change_id AND c.loan_id=NEW.loan_id AND NOT EXISTS(SELECT 1 FROM loan_billing_rate_change_voids v WHERE v.change_id=c.id) AND NOT EXISTS(SELECT 1 FROM loan_billing_rate_changes n WHERE n.loan_id=c.loan_id AND n.effective_date>c.effective_date AND NOT EXISTS(SELECT 1 FROM loan_billing_rate_change_voids v WHERE v.change_id=n.id)) AND NOT EXISTS(SELECT 1 FROM loan_billing_events e WHERE e.loan_id=c.loan_id AND e.event_date>=c.effective_date AND NOT EXISTS(SELECT 1 FROM loan_billing_event_voids v WHERE v.event_id=e.id AND v.status='final'))) THEN RAISE(ABORT,'rate correction stale, unauthorized, or later activity requires correction') END;
END;
CREATE TRIGGER billing_rate_void_revision AFTER INSERT ON loan_billing_rate_change_voids BEGIN UPDATE loan_billing_revisions SET revision=revision+1 WHERE loan_id=NEW.loan_id; END;
CREATE TRIGGER billing_rate_void_no_update BEFORE UPDATE ON loan_billing_rate_change_voids BEGIN SELECT RAISE(ABORT,'rate correction immutable'); END;
CREATE TRIGGER billing_rate_void_no_delete BEFORE DELETE ON loan_billing_rate_change_voids BEGIN SELECT RAISE(ABORT,'rate correction immutable'); END;
CREATE TRIGGER billing_config_rate_cancel_guard BEFORE INSERT ON loan_billing_config_cancellations WHEN EXISTS(SELECT 1 FROM loan_billing_rate_changes c WHERE c.loan_id=NEW.loan_id AND c.config_request_key=NEW.config_request_key AND NOT EXISTS(SELECT 1 FROM loan_billing_rate_change_voids v WHERE v.change_id=c.id)) BEGIN SELECT RAISE(ABORT,'correct active rate changes before cancelling billing'); END;
