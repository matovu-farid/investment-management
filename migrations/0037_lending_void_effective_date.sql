-- A posted reversal does not offset a journal in the dated ledger until its
-- effective date. Use the database's UTC date at the instant the void is saved.
CREATE TRIGGER lending_void_reversal_effective BEFORE INSERT ON loan_source_voids
BEGIN
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM journal_entries j
  WHERE j.status='posted'
   AND ((NEW.source_kind='loan' AND j.source_type='loan-disbursement' AND j.source_id=NEW.source_id)
     OR (NEW.source_kind='repayment' AND j.source_type='loan-repayment' AND j.source_id=NEW.source_id)
     OR EXISTS (SELECT 1 FROM journal_corrections c WHERE c.journal_id=j.id AND c.source_kind=NEW.source_kind AND c.source_id=NEW.source_id))
   AND NOT EXISTS (SELECT 1 FROM journal_entries rev WHERE rev.reverses_entry_id=j.id AND rev.status='posted' AND rev.effective_date<=date('now'))
 ) THEN RAISE(ABORT,'journal reversal is not yet effective (UTC)') END;
END;
