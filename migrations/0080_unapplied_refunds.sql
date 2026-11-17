-- Refunds consume only the excess on a specific, active billing receipt.
CREATE TABLE unapplied_refunds (
 id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, event_id TEXT NOT NULL REFERENCES loan_billing_events(id),
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0 AND typeof(amount_minor)='integer'),
 effective_date TEXT NOT NULL, cash_account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
 journal_id TEXT NOT NULL UNIQUE, reason TEXT NOT NULL CHECK(length(trim(reason))>0), created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE unapplied_refund_reversals (
 id TEXT PRIMARY KEY, refund_id TEXT NOT NULL UNIQUE REFERENCES unapplied_refunds(id), request_key TEXT NOT NULL UNIQUE,
 effective_date TEXT NOT NULL, reason TEXT NOT NULL CHECK(length(trim(reason))>0), journal_id TEXT NOT NULL UNIQUE, period_open_confirmed INTEGER NOT NULL CHECK(period_open_confirmed=1),
 created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER unapplied_refund_insert BEFORE INSERT ON unapplied_refunds BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') OR NEW.effective_date>date('now') OR NOT EXISTS(
  SELECT 1 FROM loan_billing_events e JOIN loans l ON l.id=e.loan_id JOIN ledger_accounts cash ON cash.id=NEW.cash_account_id
  WHERE e.id=NEW.event_id AND e.unapplied_minor>0 AND e.liability_account_id IS NOT NULL AND e.repayment_journal_id IS NOT NULL
   AND EXISTS(SELECT 1 FROM journal_entries j WHERE j.id=e.repayment_journal_id AND j.status='posted' AND NOT EXISTS(SELECT 1 FROM journal_entries x WHERE x.reverses_entry_id=j.id AND x.status='posted'))
   AND NEW.effective_date>=e.event_date AND cash.currency=l.currency AND cash.id<>e.liability_account_id
   AND NOT EXISTS(SELECT 1 FROM loan_billing_event_voids v WHERE v.event_id=e.id AND v.status IN ('pending','final'))
   AND NEW.amount_minor<=e.unapplied_minor-COALESCE((SELECT SUM(r.amount_minor) FROM unapplied_refunds r WHERE r.event_id=e.id AND NOT EXISTS(SELECT 1 FROM unapplied_refund_reversals x WHERE x.refund_id=r.id)),0)
 ) THEN RAISE(ABORT,'refund unavailable, invalid or unauthorized') END;
END;
CREATE TRIGGER unapplied_refund_immutable BEFORE UPDATE ON unapplied_refunds BEGIN SELECT RAISE(ABORT,'refund immutable'); END;
CREATE TRIGGER unapplied_refund_no_delete BEFORE DELETE ON unapplied_refunds BEGIN SELECT RAISE(ABORT,'refund immutable'); END;
CREATE TRIGGER unapplied_refund_post BEFORE UPDATE OF status ON journal_entries WHEN NEW.status='posted' AND NEW.source_type='unapplied-refund' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM unapplied_refunds r JOIN loan_billing_events e ON e.id=r.event_id JOIN loans l ON l.id=e.loan_id WHERE r.id=NEW.source_id AND r.journal_id=NEW.id AND r.created_by=NEW.created_by AND NEW.currency=l.currency AND NEW.effective_date=r.effective_date AND (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id)=2 AND EXISTS(SELECT 1 FROM journal_lines WHERE entry_id=NEW.id AND account_id=e.liability_account_id AND side='debit' AND amount_minor=r.amount_minor) AND EXISTS(SELECT 1 FROM journal_lines WHERE entry_id=NEW.id AND account_id=r.cash_account_id AND side='credit' AND amount_minor=r.amount_minor)) THEN RAISE(ABORT,'refund journal mismatch') END;
END;
CREATE TRIGGER unapplied_refund_reversal_insert BEFORE INSERT ON unapplied_refund_reversals BEGIN
 SELECT CASE WHEN NEW.period_open_confirmed<>1 OR NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') OR NEW.effective_date>date('now') OR NOT EXISTS(SELECT 1 FROM unapplied_refunds r JOIN journal_entries j ON j.id=r.journal_id WHERE r.id=NEW.refund_id AND j.status='posted' AND NEW.effective_date=r.effective_date AND NOT EXISTS(SELECT 1 FROM journal_entries x WHERE x.reverses_entry_id=j.id AND x.status='posted')) THEN RAISE(ABORT,'refund reversal unavailable or period not confirmed open') END;
END;
CREATE TRIGGER unapplied_refund_reversal_post BEFORE UPDATE OF status ON journal_entries WHEN NEW.status='posted' AND NEW.source_type='unapplied-refund-reversal' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM unapplied_refund_reversals x JOIN unapplied_refunds r ON r.id=x.refund_id WHERE x.id=NEW.source_id AND x.journal_id=NEW.id AND x.created_by=NEW.created_by AND NEW.effective_date=x.effective_date AND NEW.reverses_entry_id=r.journal_id) THEN RAISE(ABORT,'refund reversal mismatch') END;
END;
CREATE TRIGGER unapplied_refund_reversal_guard BEFORE UPDATE OF status ON journal_entries WHEN NEW.status='posted' AND NEW.reverses_entry_id IS NOT NULL AND EXISTS(SELECT 1 FROM unapplied_refunds WHERE journal_id=NEW.reverses_entry_id) BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM unapplied_refund_reversals x JOIN unapplied_refunds r ON r.id=x.refund_id WHERE x.journal_id=NEW.id AND r.journal_id=NEW.reverses_entry_id AND NEW.source_type='unapplied-refund-reversal' AND NEW.source_id=x.id AND x.created_by=NEW.created_by) THEN RAISE(ABORT,'reviewed refund reversal required') END;
END;
CREATE TRIGGER unapplied_refund_no_reversal_of_reversal BEFORE UPDATE OF status ON journal_entries WHEN NEW.status='posted' AND EXISTS(SELECT 1 FROM unapplied_refund_reversals WHERE journal_id=NEW.reverses_entry_id) BEGIN SELECT RAISE(ABORT,'record a new reviewed refund instead'); END;
CREATE TRIGGER unapplied_refund_reversal_immutable BEFORE UPDATE ON unapplied_refund_reversals BEGIN SELECT RAISE(ABORT,'refund reversal immutable'); END;
CREATE TRIGGER unapplied_refund_reversal_no_delete BEFORE DELETE ON unapplied_refund_reversals BEGIN SELECT RAISE(ABORT,'refund reversal immutable'); END;
CREATE TRIGGER unapplied_refund_blocks_billing_correction BEFORE INSERT ON loan_billing_event_voids WHEN EXISTS(SELECT 1 FROM unapplied_refunds r WHERE r.event_id=NEW.event_id AND NOT EXISTS(SELECT 1 FROM unapplied_refund_reversals x WHERE x.refund_id=r.id)) BEGIN SELECT RAISE(ABORT,'reverse unapplied refunds before correcting billing'); END;
