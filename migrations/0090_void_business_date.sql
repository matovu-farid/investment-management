-- Reversal effectiveness follows the Kampala calendar date (UTC+3).
-- Preserve all other source-void safeguards.

DROP TRIGGER lending_void_reversal_effective;
CREATE TRIGGER lending_void_reversal_effective BEFORE INSERT ON loan_source_voids
BEGIN
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM journal_entries j
  WHERE j.status='posted'
   AND ((NEW.source_kind='loan' AND j.source_type='loan-disbursement' AND j.source_id=NEW.source_id)
     OR (NEW.source_kind='repayment' AND j.source_type='loan-repayment' AND j.source_id=NEW.source_id)
     OR EXISTS (SELECT 1 FROM journal_corrections c WHERE c.journal_id=j.id AND c.source_kind=NEW.source_kind AND c.source_id=NEW.source_id))
   AND NOT EXISTS (SELECT 1 FROM journal_entries rev WHERE rev.reverses_entry_id=j.id AND rev.status='posted' AND rev.effective_date<=date('now','+3 hours'))
 ) THEN RAISE(ABORT,'journal reversal is not yet effective (Kampala date)') END;
END;

DROP TRIGGER investment_void_active_journal;
CREATE TRIGGER investment_void_active_journal BEFORE INSERT ON investment_source_voids
WHEN NEW.source_kind='transaction' AND EXISTS (
 SELECT 1 FROM journal_entries j WHERE j.source_type='investment-transaction' AND j.source_id=NEW.source_id
 AND (j.status='draft' OR (j.status='posted' AND NOT EXISTS(SELECT 1 FROM journal_entries r WHERE r.reverses_entry_id=j.id AND r.status='posted' AND r.effective_date<=date('now','+3 hours'))))
)
BEGIN SELECT RAISE(ABORT,'investment journal must be reversed and effective before void'); END;

DROP TRIGGER investment_correction_void;
CREATE TRIGGER investment_correction_void BEFORE INSERT ON investment_source_voids
WHEN NEW.source_kind='transaction' AND EXISTS (
 SELECT 1 FROM investment_journal_corrections c JOIN journal_entries j ON j.id=c.journal_id WHERE c.transaction_id=NEW.source_id
 AND (j.status='draft' OR (j.status='posted' AND NOT EXISTS(SELECT 1 FROM journal_entries r WHERE r.reverses_entry_id=j.id AND r.status='posted' AND r.effective_date<=date('now','+3 hours'))))
) BEGIN SELECT RAISE(ABORT,'correction must be reversed and effective before void'); END;

DROP TRIGGER cash_entry_void_active_journal;
CREATE TRIGGER cash_entry_void_active_journal BEFORE INSERT ON cash_entry_voids
WHEN EXISTS(SELECT 1 FROM journal_entries j WHERE j.source_type='cash-entry' AND j.source_id=NEW.entry_id AND (j.status='draft' OR (j.status='posted' AND NOT EXISTS(SELECT 1 FROM journal_entries r WHERE r.reverses_entry_id=j.id AND r.status='posted' AND r.effective_date<=date('now','+3 hours')))))
BEGIN SELECT RAISE(ABORT,'cash journal must be reversed and effective before void') ; END;

DROP TRIGGER cash_correction_void;
CREATE TRIGGER cash_correction_void BEFORE INSERT ON cash_entry_voids WHEN EXISTS(SELECT 1 FROM cash_journal_corrections c JOIN journal_entries j ON j.id=c.journal_id WHERE c.entry_id=NEW.entry_id AND (j.status='draft' OR (j.status='posted' AND NOT EXISTS(SELECT 1 FROM journal_entries r WHERE r.reverses_entry_id=j.id AND r.status='posted' AND r.effective_date<=date('now','+3 hours'))))) BEGIN SELECT RAISE(ABORT,'correction must be reversed and effective before void'); END;
