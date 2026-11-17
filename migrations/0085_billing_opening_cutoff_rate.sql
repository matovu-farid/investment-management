-- Existing snapshots remain unchanged: NULL denotes the unreviewed prior original-rate assumption.
ALTER TABLE loan_billing_opening_states ADD COLUMN cutoff_rate_basis_points INTEGER;
ALTER TABLE loan_billing_opening_states ADD COLUMN cutoff_period_days INTEGER;

-- Every new snapshot records a reviewed rate; existing rows retain their legacy default.
CREATE TRIGGER billing_opening_cutoff_rate_insert BEFORE INSERT ON loan_billing_opening_states BEGIN
 SELECT CASE WHEN NEW.cutoff_rate_basis_points IS NULL OR NEW.cutoff_period_days IS NULL OR typeof(NEW.cutoff_rate_basis_points)<>'integer' OR NEW.cutoff_rate_basis_points<0 OR NEW.cutoff_rate_basis_points>10000 OR NEW.cutoff_period_days NOT IN (30,60,180) THEN RAISE(ABORT,'reviewed opening cutoff rate required') END;
END;

-- Alternate writers must not post new billing against an unreviewed legacy rate.
CREATE TRIGGER billing_event_requires_reviewed_cutoff_rate BEFORE INSERT ON loan_billing_events
WHEN EXISTS(SELECT 1 FROM loan_billing_opening_states o WHERE o.loan_id=NEW.loan_id AND (o.cutoff_rate_basis_points IS NULL OR o.cutoff_period_days IS NULL))
BEGIN SELECT RAISE(ABORT,'legacy opening cutoff rate must be reviewed before billing'); END;

CREATE TRIGGER billing_publication_requires_reviewed_cutoff_rate BEFORE INSERT ON billing_balance_publications
WHEN EXISTS(SELECT 1 FROM loan_billing_opening_states o WHERE o.loan_id=NEW.loan_id AND (o.cutoff_rate_basis_points IS NULL OR o.cutoff_period_days IS NULL))
BEGIN SELECT RAISE(ABORT,'legacy opening cutoff rate must be reviewed before publishing'); END;
