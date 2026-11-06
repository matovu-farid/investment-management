-- Correction links preserve every posted journal and serialize successors of a reversal.
CREATE TABLE journal_corrections (
 id TEXT PRIMARY KEY NOT NULL,
 source_kind TEXT NOT NULL CHECK(source_kind IN ('loan','repayment')),
 source_id TEXT NOT NULL,
 journal_id TEXT NOT NULL UNIQUE REFERENCES journal_entries(id),
 predecessor_reversal_id TEXT NOT NULL UNIQUE REFERENCES journal_entries(id),
 created_by TEXT NOT NULL,
 request_key TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER correction_link_guard BEFORE INSERT ON journal_corrections BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM journal_entries j JOIN journal_entries rev ON rev.id=NEW.predecessor_reversal_id AND rev.status='posted'
  JOIN journal_entries prev ON prev.id=rev.reverses_entry_id AND prev.status='posted'
  WHERE j.id=NEW.journal_id AND j.status='draft' AND j.created_by=NEW.created_by AND j.source_id=NEW.request_key
   AND j.source_type=CASE NEW.source_kind WHEN 'loan' THEN 'loan-disbursement-correction' ELSE 'loan-repayment-correction' END
   AND j.reverses_entry_id IS NULL AND j.currency=prev.currency AND j.effective_date>=rev.effective_date
   AND ((NEW.source_kind='loan' AND prev.source_type='loan-disbursement' AND prev.source_id=NEW.source_id)
     OR (NEW.source_kind='repayment' AND prev.source_type='loan-repayment' AND prev.source_id=NEW.source_id)
     OR EXISTS(SELECT 1 FROM journal_corrections p WHERE p.journal_id=prev.id AND p.source_kind=NEW.source_kind AND p.source_id=NEW.source_id))
 ) THEN RAISE(ABORT,'invalid predecessor or correction date') END;
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM journal_entries j WHERE j.status='posted' AND ((NEW.source_kind='loan' AND j.source_type='loan-disbursement' AND j.source_id=NEW.source_id) OR (NEW.source_kind='repayment' AND j.source_type='loan-repayment' AND j.source_id=NEW.source_id) OR EXISTS(SELECT 1 FROM journal_corrections c WHERE c.journal_id=j.id AND c.source_kind=NEW.source_kind AND c.source_id=NEW.source_id)) AND NOT EXISTS(SELECT 1 FROM journal_entries r WHERE r.reverses_entry_id=j.id AND r.status='posted')
 ) THEN RAISE(ABORT,'source has an active posting') END;
END;
CREATE TRIGGER correction_post_guard BEFORE UPDATE OF status ON journal_entries WHEN NEW.status='posted' AND NEW.source_type IN ('loan-disbursement-correction','loan-repayment-correction') BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM journal_corrections c JOIN journal_entries r ON r.id=c.predecessor_reversal_id AND r.status='posted' WHERE c.journal_id=NEW.id AND NEW.effective_date>=r.effective_date AND NEW.reverses_entry_id IS NULL) THEN RAISE(ABORT,'invalid correction date') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM journal_corrections c WHERE c.journal_id=NEW.id AND c.created_by=NEW.created_by AND c.request_key=NEW.source_id AND ((c.source_kind='loan' AND NEW.source_type='loan-disbursement-correction' AND EXISTS(SELECT 1 FROM loans l WHERE l.id=c.source_id AND l.currency=NEW.currency AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id)=2 AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id AND side='debit' AND amount_minor=l.principal_minor)=1 AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id AND side='credit' AND amount_minor=l.principal_minor)=1 AND (SELECT count(DISTINCT account_id) FROM journal_lines WHERE entry_id=NEW.id)=2)) OR (c.source_kind='repayment' AND NEW.source_type='loan-repayment-correction' AND EXISTS(SELECT 1 FROM loan_repayments r JOIN loans l ON l.id=r.loan_id WHERE r.id=c.source_id AND l.currency=NEW.currency AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id AND side='debit')=1 AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id AND side='debit' AND amount_minor=r.amount_minor)=1 AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id AND side='credit')>=1 AND (SELECT count(DISTINCT account_id) FROM journal_lines WHERE entry_id=NEW.id)=(SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id))))) THEN RAISE(ABORT,'correction must match source') END;
END;
CREATE TRIGGER correction_reversal_guard BEFORE UPDATE OF status ON journal_entries WHEN NEW.status='posted' AND NEW.source_type='source-correction-reversal' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') OR NEW.source_id IS NOT NEW.reverses_entry_id OR NOT EXISTS(SELECT 1 FROM journal_corrections c JOIN journal_entries j ON j.id=c.journal_id WHERE j.id=NEW.source_id AND j.status='posted') THEN RAISE(ABORT,'invalid correction reversal') END;
END;
CREATE TRIGGER correction_no_update BEFORE UPDATE ON journal_corrections BEGIN SELECT RAISE(ABORT,'correction history is immutable'); END;
CREATE TRIGGER correction_no_delete BEFORE DELETE ON journal_corrections BEGIN SELECT RAISE(ABORT,'correction history is immutable'); END;
