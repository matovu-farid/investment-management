-- Ordinary cash facts can be posted only after an operator selects accounts.
CREATE TRIGGER cash_entry_journal_validate BEFORE UPDATE OF status ON journal_entries
WHEN NEW.status='posted' AND NEW.source_type='cash-entry'
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') OR NEW.reverses_entry_id IS NOT NULL OR NOT EXISTS(
  SELECT 1 FROM cash_entries e WHERE e.id=NEW.source_id AND e.currency=NEW.currency AND e.entry_date=NEW.effective_date
   AND NEW.description=('Cash '||e.direction||' '||length(e.id)||':'||e.id)
   AND NOT EXISTS(SELECT 1 FROM cash_entry_voids v WHERE v.entry_id=e.id)
   AND (length(e.amount_minor)<16 OR (length(e.amount_minor)=16 AND e.amount_minor<='9007199254740991'))
   AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id)=2
   AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id AND side='debit' AND CAST(amount_minor AS TEXT)=e.amount_minor)=1
   AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id AND side='credit' AND CAST(amount_minor AS TEXT)=e.amount_minor)=1
   AND (SELECT count(DISTINCT account_id) FROM journal_lines WHERE entry_id=NEW.id)=2
 ) THEN RAISE(ABORT,'journal must match active recorded cash entry') END;
END;
CREATE TRIGGER cash_entry_reversal_validate BEFORE UPDATE OF status ON journal_entries
WHEN NEW.status='posted' AND NEW.source_type='cash-entry-reversal'
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') OR NEW.reverses_entry_id IS NOT NEW.source_id OR NOT EXISTS(SELECT 1 FROM journal_entries j WHERE j.id=NEW.source_id AND j.source_type='cash-entry' AND j.status='posted') THEN RAISE(ABORT,'invalid cash entry reversal') END;
END;
CREATE TRIGGER cash_entry_void_active_journal BEFORE INSERT ON cash_entry_voids
WHEN EXISTS(SELECT 1 FROM journal_entries j WHERE j.source_type='cash-entry' AND j.source_id=NEW.entry_id AND (j.status='draft' OR (j.status='posted' AND NOT EXISTS(SELECT 1 FROM journal_entries r WHERE r.reverses_entry_id=j.id AND r.status='posted' AND r.effective_date<=date('now')))))
BEGIN SELECT RAISE(ABORT,'cash journal must be reversed and effective before void') ; END;
