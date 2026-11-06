-- Source-linked journals require the exact recorded receipt; allocation remains an explicit operator choice.
CREATE TRIGGER validate_repayment_post BEFORE UPDATE OF status ON journal_entries
WHEN NEW.status='posted' AND NEW.source_type='loan-repayment'
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NEW.reverses_entry_id IS NOT NULL OR NOT EXISTS (
  SELECT 1 FROM loan_repayments r JOIN loans n ON n.id=r.loan_id WHERE r.id=NEW.source_id AND n.currency=NEW.currency AND r.payment_date=NEW.effective_date AND NEW.description=('Loan repayment ' || length(r.id) || ':' || r.id || ' loan ' || length(n.id) || ':' || n.id || ' member ' || length(n.member_id) || ':' || n.member_id)
   AND (SELECT COUNT(*) FROM journal_lines WHERE entry_id=NEW.id AND side='debit' AND amount_minor=r.amount_minor)=1
   AND (SELECT COUNT(*) FROM journal_lines WHERE entry_id=NEW.id AND side='debit')=1
   AND (SELECT COUNT(*) FROM journal_lines WHERE entry_id=NEW.id AND side='credit')>=1
   AND (SELECT COUNT(DISTINCT account_id) FROM journal_lines WHERE entry_id=NEW.id AND side='credit')=(SELECT COUNT(*) FROM journal_lines WHERE entry_id=NEW.id AND side='credit')
   AND NOT EXISTS(SELECT 1 FROM journal_lines d JOIN journal_lines c ON c.entry_id=d.entry_id AND c.account_id=d.account_id WHERE d.entry_id=NEW.id AND d.side='debit' AND c.side='credit')
 ) THEN RAISE(ABORT,'journal must match recorded repayment') END;
END;
CREATE TRIGGER posted_repayment_immutable BEFORE UPDATE OF id,loan_id,payment_date,amount_minor ON loan_repayments
WHEN (NEW.id IS NOT OLD.id OR NEW.loan_id IS NOT OLD.loan_id OR NEW.payment_date IS NOT OLD.payment_date OR NEW.amount_minor IS NOT OLD.amount_minor) AND EXISTS(SELECT 1 FROM journal_entries WHERE source_type='loan-repayment' AND source_id=OLD.id AND status='posted') BEGIN SELECT RAISE(ABORT,'posted repayment is immutable'); END;
CREATE TRIGGER posted_repayment_no_delete BEFORE DELETE ON loan_repayments WHEN EXISTS(SELECT 1 FROM journal_entries WHERE source_type='loan-repayment' AND source_id=OLD.id AND status='posted') BEGIN SELECT RAISE(ABORT,'posted repayment is immutable'); END;
CREATE TRIGGER repayment_loan_immutable BEFORE UPDATE OF id,member_id,currency ON loans WHEN (NEW.id IS NOT OLD.id OR NEW.member_id IS NOT OLD.member_id OR NEW.currency IS NOT OLD.currency) AND EXISTS(SELECT 1 FROM loan_repayments r JOIN journal_entries j ON j.source_type='loan-repayment' AND j.source_id=r.id AND j.status='posted' WHERE r.loan_id=OLD.id) BEGIN SELECT RAISE(ABORT,'repayment loan fields are immutable'); END;
CREATE TRIGGER repayment_loan_no_delete BEFORE DELETE ON loans WHEN EXISTS(SELECT 1 FROM loan_repayments r JOIN journal_entries j ON j.source_type='loan-repayment' AND j.source_id=r.id AND j.status='posted' WHERE r.loan_id=OLD.id) BEGIN SELECT RAISE(ABORT,'repayment loan is immutable'); END;
CREATE TRIGGER validate_repayment_reversal BEFORE UPDATE OF status ON journal_entries WHEN NEW.status='posted' AND NEW.source_type='loan-repayment-reversal' BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') OR NEW.reverses_entry_id IS NOT NEW.source_id OR NOT EXISTS(SELECT 1 FROM journal_entries j WHERE j.id=NEW.source_id AND j.source_type='loan-repayment' AND j.status='posted') THEN RAISE(ABORT,'repayment reversal requires authorized administrator and posted receipt') END; END;
