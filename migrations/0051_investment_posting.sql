-- A source-linked journal records the operator's explicit account selection.
CREATE TRIGGER investment_journal_validate BEFORE UPDATE OF status ON journal_entries
WHEN NEW.status='posted' AND NEW.source_type='investment-transaction'
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') OR NEW.reverses_entry_id IS NOT NULL OR NOT EXISTS (
  SELECT 1 FROM investment_transactions t JOIN investments i ON i.id=t.investment_id
  WHERE t.id=NEW.source_id AND i.currency=NEW.currency AND t.transaction_date=NEW.effective_date
   AND NEW.description=('Investment transaction '||length(t.id)||':'||t.id||' investment '||length(i.id)||':'||i.id||' type '||length(t.transaction_type)||':'||t.transaction_type)
   AND NOT EXISTS(SELECT 1 FROM investment_source_voids v WHERE v.source_kind='transaction' AND v.source_id=t.id)
   AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id)=2
   AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id AND side='debit' AND amount_minor=t.amount_minor)=1
   AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id AND side='credit' AND amount_minor=t.amount_minor)=1
   AND (SELECT count(DISTINCT account_id) FROM journal_lines WHERE entry_id=NEW.id)=2
 ) THEN RAISE(ABORT,'journal must match active recorded investment transaction') END;
END;
CREATE TRIGGER investment_reversal_validate BEFORE UPDATE OF status ON journal_entries
WHEN NEW.status='posted' AND NEW.source_type='investment-transaction-reversal'
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') OR NEW.reverses_entry_id IS NOT NEW.source_id OR NOT EXISTS(SELECT 1 FROM journal_entries j WHERE j.id=NEW.source_id AND j.source_type='investment-transaction' AND j.status='posted') THEN RAISE(ABORT,'invalid investment transaction reversal') END;
END;
CREATE TRIGGER investment_posted_source_no_update BEFORE UPDATE ON investment_transactions
WHEN EXISTS(SELECT 1 FROM journal_entries WHERE source_type='investment-transaction' AND source_id=OLD.id AND status='posted')
BEGIN SELECT RAISE(ABORT,'posted investment transaction is immutable'); END;
CREATE TRIGGER investment_posted_source_no_delete BEFORE DELETE ON investment_transactions
WHEN EXISTS(SELECT 1 FROM journal_entries WHERE source_type='investment-transaction' AND source_id=OLD.id AND status='posted')
BEGIN SELECT RAISE(ABORT,'posted investment transaction is immutable'); END;
CREATE TRIGGER investment_posted_identity_no_update BEFORE UPDATE OF id,currency ON investments
WHEN (NEW.id IS NOT OLD.id OR NEW.currency IS NOT OLD.currency) AND EXISTS(SELECT 1 FROM investment_transactions t JOIN journal_entries j ON j.source_type='investment-transaction' AND j.source_id=t.id AND j.status='posted' WHERE t.investment_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'posted investment identity is immutable'); END;
CREATE TRIGGER investment_void_active_journal BEFORE INSERT ON investment_source_voids
WHEN NEW.source_kind='transaction' AND EXISTS (
 SELECT 1 FROM journal_entries j WHERE j.source_type='investment-transaction' AND j.source_id=NEW.source_id
 AND (j.status='draft' OR (j.status='posted' AND NOT EXISTS(SELECT 1 FROM journal_entries r WHERE r.reverses_entry_id=j.id AND r.status='posted' AND r.effective_date<=date('now'))))
)
BEGIN SELECT RAISE(ABORT,'investment journal must be reversed and effective before void'); END;
