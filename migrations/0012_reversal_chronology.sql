-- A reversal cannot appear in an as-of ledger before its original entry.
CREATE TRIGGER journal_reversal_date_before_post
BEFORE UPDATE OF status ON journal_entries
WHEN NEW.status = 'posted' AND NEW.reverses_entry_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM journal_entries original
              WHERE original.id = NEW.reverses_entry_id
                AND NEW.effective_date < original.effective_date)
BEGIN
  SELECT RAISE(ABORT, 'reversal date before original journal');
END;
