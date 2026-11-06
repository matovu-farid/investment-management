-- A replacement retains its source and the exact reversal it follows.
CREATE TABLE investment_journal_corrections (
 id TEXT PRIMARY KEY NOT NULL,
 transaction_id TEXT NOT NULL REFERENCES investment_transactions(id),
 journal_id TEXT NOT NULL UNIQUE REFERENCES journal_entries(id),
 predecessor_reversal_id TEXT NOT NULL UNIQUE REFERENCES journal_entries(id),
 created_by TEXT NOT NULL REFERENCES "user"(id),
 request_key TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER investment_correction_link BEFORE INSERT ON investment_journal_corrections BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM investment_source_voids WHERE source_kind='transaction' AND source_id=NEW.transaction_id) THEN RAISE(ABORT,'source void') END;
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM journal_entries j JOIN journal_entries r ON r.id=NEW.predecessor_reversal_id AND r.status='posted'
  JOIN journal_entries p ON p.id=r.reverses_entry_id AND p.status='posted'
  JOIN investment_transactions t ON t.id=NEW.transaction_id JOIN investments i ON i.id=t.investment_id
  WHERE j.id=NEW.journal_id AND j.status='draft' AND j.source_type='investment-transaction-correction'
   AND j.source_id=NEW.request_key AND j.created_by=NEW.created_by AND j.reverses_entry_id IS NULL
   AND j.currency=p.currency AND j.currency=i.currency AND j.effective_date>=r.effective_date
   AND ((p.source_type='investment-transaction' AND p.source_id=t.id)
    OR EXISTS(SELECT 1 FROM investment_journal_corrections c WHERE c.transaction_id=t.id AND c.journal_id=p.id))
 ) THEN RAISE(ABORT,'invalid predecessor or correction date') END;
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM journal_entries j WHERE ((j.source_type='investment-transaction' AND j.source_id=NEW.transaction_id)
   OR EXISTS(SELECT 1 FROM investment_journal_corrections c WHERE c.transaction_id=NEW.transaction_id AND c.journal_id=j.id))
   AND (j.status='draft' OR (j.status='posted' AND NOT EXISTS(SELECT 1 FROM journal_entries r WHERE r.reverses_entry_id=j.id AND r.status='posted')))
 ) THEN RAISE(ABORT,'source has an active journal') END;
END;
CREATE TRIGGER investment_correction_post BEFORE UPDATE OF status ON journal_entries
WHEN NEW.status='posted' AND NEW.source_type='investment-transaction-correction' BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM investment_journal_corrections c JOIN investment_transactions t ON t.id=c.transaction_id
  JOIN investments i ON i.id=t.investment_id JOIN journal_entries r ON r.id=c.predecessor_reversal_id AND r.status='posted'
  JOIN app_user_roles a ON a.user_id=NEW.created_by AND a.role='admin'
  WHERE c.journal_id=NEW.id AND c.created_by=NEW.created_by AND c.request_key=NEW.source_id
   AND NEW.reverses_entry_id IS NULL AND NEW.effective_date>=r.effective_date AND NEW.currency=i.currency
   AND NOT EXISTS(SELECT 1 FROM investment_source_voids v WHERE v.source_kind='transaction' AND v.source_id=t.id)
   AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id)=2
   AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id AND side='debit' AND amount_minor=t.amount_minor)=1
   AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id AND side='credit' AND amount_minor=t.amount_minor)=1
   AND (SELECT count(DISTINCT account_id) FROM journal_lines WHERE entry_id=NEW.id)=2
 ) THEN RAISE(ABORT,'correction must match active source') END;
END;
CREATE TRIGGER investment_correction_draft_immutable BEFORE UPDATE ON journal_entries
WHEN EXISTS(SELECT 1 FROM investment_journal_corrections WHERE journal_id=OLD.id)
 AND (NEW.id IS NOT OLD.id OR NEW.currency IS NOT OLD.currency OR NEW.effective_date IS NOT OLD.effective_date OR NEW.description IS NOT OLD.description OR NEW.source_type IS NOT OLD.source_type OR NEW.source_id IS NOT OLD.source_id OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at OR NEW.reverses_entry_id IS NOT OLD.reverses_entry_id)
BEGIN SELECT RAISE(ABORT,'correction journal metadata is immutable'); END;
CREATE TRIGGER investment_correction_reversal BEFORE UPDATE OF status ON journal_entries
WHEN NEW.status='posted' AND NEW.source_type='investment-correction-reversal' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') OR NEW.reverses_entry_id IS NOT NEW.source_id OR NOT EXISTS(SELECT 1 FROM investment_journal_corrections c JOIN journal_entries j ON j.id=c.journal_id WHERE j.id=NEW.source_id AND j.status='posted') THEN RAISE(ABORT,'invalid correction reversal') END;
END;
CREATE TRIGGER investment_correction_void BEFORE INSERT ON investment_source_voids
WHEN NEW.source_kind='transaction' AND EXISTS (
 SELECT 1 FROM investment_journal_corrections c JOIN journal_entries j ON j.id=c.journal_id WHERE c.transaction_id=NEW.source_id
 AND (j.status='draft' OR (j.status='posted' AND NOT EXISTS(SELECT 1 FROM journal_entries r WHERE r.reverses_entry_id=j.id AND r.status='posted' AND r.effective_date<=date('now'))))
) BEGIN SELECT RAISE(ABORT,'correction must be reversed and effective before void'); END;
CREATE TRIGGER investment_correction_no_update BEFORE UPDATE ON investment_journal_corrections BEGIN SELECT RAISE(ABORT,'correction history is immutable'); END;
CREATE TRIGGER investment_correction_no_delete BEFORE DELETE ON investment_journal_corrections BEGIN SELECT RAISE(ABORT,'correction history is immutable'); END;
