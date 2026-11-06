-- Bind new disbursement postings to the member reviewed by the administrator.
-- Existing posted entries retain their original descriptions and history.
DROP TRIGGER validate_loan_disbursement_post;
CREATE TRIGGER validate_loan_disbursement_post BEFORE UPDATE OF status ON journal_entries
WHEN NEW.status='posted' AND NEW.source_type='loan-disbursement'
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NEW.reverses_entry_id IS NOT NULL OR NOT EXISTS (
   SELECT 1 FROM loans l WHERE l.id=NEW.source_id AND l.currency=NEW.currency AND l.disbursement_date=NEW.effective_date
     AND NEW.description=('Loan principal disbursement ' || length(l.id) || ':' || l.id || ' member ' || length(l.member_id) || ':' || l.member_id)
     AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id)=2
     AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id AND side='debit' AND amount_minor=l.principal_minor)=1
     AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id AND side='credit' AND amount_minor=l.principal_minor)=1
     AND (SELECT count(DISTINCT account_id) FROM journal_lines WHERE entry_id=NEW.id)=2
 ) THEN RAISE(ABORT,'loan disbursement journal must match recorded loan') END;
END;
CREATE TRIGGER loan_disbursement_reversal_admin BEFORE UPDATE OF status ON journal_entries
WHEN NEW.status='posted' AND NEW.source_type='loan-disbursement-reversal'
 AND NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin')
BEGIN SELECT RAISE(ABORT,'unauthorized'); END;
