-- A loan-disbursement journal must reflect the recorded loan at posting time.
CREATE TRIGGER validate_loan_disbursement_post BEFORE UPDATE OF status ON journal_entries
WHEN NEW.status='posted' AND NEW.source_type='loan-disbursement'
BEGIN
 SELECT CASE WHEN NEW.reverses_entry_id IS NOT NULL OR NOT EXISTS (
   SELECT 1 FROM loans l WHERE l.id=NEW.source_id AND l.currency=NEW.currency AND l.disbursement_date=NEW.effective_date
     AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id)=2
     AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id AND side='debit' AND amount_minor=l.principal_minor)=1
     AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id AND side='credit' AND amount_minor=l.principal_minor)=1
     AND (SELECT count(DISTINCT account_id) FROM journal_lines WHERE entry_id=NEW.id)=2
 ) THEN RAISE(ABORT,'loan disbursement journal must match recorded loan') END;
END;
CREATE TRIGGER posted_loan_financial_fields_immutable BEFORE UPDATE OF id,member_id,principal_minor,currency,disbursement_date ON loans
WHEN (NEW.id IS NOT OLD.id OR NEW.member_id IS NOT OLD.member_id OR NEW.principal_minor IS NOT OLD.principal_minor OR NEW.currency IS NOT OLD.currency OR NEW.disbursement_date IS NOT OLD.disbursement_date)
 AND EXISTS (SELECT 1 FROM journal_entries WHERE source_type='loan-disbursement' AND source_id=OLD.id AND status='posted')
BEGIN SELECT RAISE(ABORT,'posted loan financial fields are immutable'); END;
CREATE TRIGGER posted_loan_no_delete BEFORE DELETE ON loans
WHEN EXISTS (SELECT 1 FROM journal_entries WHERE source_type='loan-disbursement' AND source_id=OLD.id AND status='posted')
BEGIN SELECT RAISE(ABORT,'posted loan cannot be deleted'); END;
CREATE TRIGGER validate_loan_disbursement_reversal BEFORE UPDATE OF status ON journal_entries
WHEN NEW.status='posted' AND NEW.source_type='loan-disbursement-reversal'
BEGIN
 SELECT CASE WHEN NEW.reverses_entry_id IS NOT NEW.source_id OR NOT EXISTS (
   SELECT 1 FROM journal_entries original WHERE original.id=NEW.source_id AND original.source_type='loan-disbursement' AND original.status='posted'
 ) THEN RAISE(ABORT,'loan reversal must reference a posted loan disbursement') END;
END;
