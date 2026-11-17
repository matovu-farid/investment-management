-- A declaration records what the operator reviewed; it is not payment evidence.
-- Existing journals remain valid and have no inferred route.
CREATE TABLE loan_dispatch_declarations (
  journal_id TEXT PRIMARY KEY REFERENCES journal_entries(id),
  loan_id TEXT NOT NULL UNIQUE REFERENCES loans(id),
  route TEXT NOT NULL CHECK(route IN ('equity','other-bank','mobile-money','cash','historical-unknown')),
  declared_by TEXT NOT NULL REFERENCES "user"(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER loan_dispatch_declaration_insert BEFORE INSERT ON loan_dispatch_declarations BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM app_user_roles WHERE user_id=NEW.declared_by AND role='admin')
    THEN RAISE(ABORT,'unauthorized') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM journal_entries j JOIN loans l ON l.id=j.source_id
    JOIN app_user_roles r ON r.user_id=NEW.declared_by AND r.role='admin'
    WHERE j.id=NEW.journal_id AND j.status='draft' AND j.source_type='loan-disbursement'
      AND j.source_id=NEW.loan_id AND j.created_by=NEW.declared_by
      AND (l.disbursement_date<'2025-09-28' OR NEW.route NOT IN ('cash','historical-unknown'))
  ) THEN RAISE(ABORT,'invalid disbursement route declaration') END;
END;
CREATE TRIGGER loan_dispatch_declaration_no_update BEFORE UPDATE ON loan_dispatch_declarations BEGIN
  SELECT RAISE(ABORT,'disbursement route declaration is immutable');
END;
CREATE TRIGGER loan_dispatch_declaration_no_delete BEFORE DELETE ON loan_dispatch_declarations BEGIN
  SELECT RAISE(ABORT,'disbursement route declaration is immutable');
END;
