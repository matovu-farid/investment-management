-- Journals are created as drafts, filled with lines, then posted in one D1 batch.
-- Posting is the database-enforced balance boundary; posted history is immutable.
CREATE TABLE ledger_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  currency TEXT NOT NULL CHECK(currency GLOB '[A-Z][A-Z][A-Z]'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY NOT NULL,
  currency TEXT NOT NULL CHECK(currency GLOB '[A-Z][A-Z][A-Z]'),
  effective_date TEXT NOT NULL CHECK(length(effective_date) = 10 AND effective_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  description TEXT NOT NULL CHECK(length(trim(description)) > 0),
  source_type TEXT NOT NULL CHECK(length(trim(source_type)) > 0),
  source_id TEXT NOT NULL CHECK(length(trim(source_id)) > 0),
  created_by TEXT NOT NULL CHECK(length(trim(created_by)) > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted')),
  reverses_entry_id TEXT UNIQUE REFERENCES journal_entries(id),
  UNIQUE(source_type, source_id),
  CHECK(reverses_entry_id IS NULL OR reverses_entry_id <> id)
);

CREATE TABLE journal_lines (
  id TEXT PRIMARY KEY NOT NULL,
  entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  side TEXT NOT NULL CHECK(side IN ('debit','credit')),
  amount_minor INTEGER NOT NULL CHECK(typeof(amount_minor) = 'integer' AND amount_minor > 0 AND amount_minor <= 9007199254740991)
);
CREATE INDEX journal_lines_entry_idx ON journal_lines(entry_id);
CREATE INDEX journal_lines_account_idx ON journal_lines(account_id);

CREATE TRIGGER journal_insert_draft BEFORE INSERT ON journal_entries
WHEN NEW.status <> 'draft' BEGIN SELECT RAISE(ABORT, 'journals must start as drafts'); END;
CREATE TRIGGER journal_posted_no_update BEFORE UPDATE ON journal_entries
WHEN OLD.status = 'posted' BEGIN SELECT RAISE(ABORT, 'posted journals are immutable'); END;
CREATE TRIGGER journal_posted_no_delete BEFORE DELETE ON journal_entries
WHEN OLD.status = 'posted' BEGIN SELECT RAISE(ABORT, 'posted journals are immutable'); END;
CREATE TRIGGER journal_post_metadata BEFORE UPDATE ON journal_entries
WHEN NEW.status = 'posted' AND (NEW.id IS NOT OLD.id OR NEW.currency IS NOT OLD.currency OR NEW.effective_date IS NOT OLD.effective_date OR NEW.description IS NOT OLD.description OR NEW.source_type IS NOT OLD.source_type OR NEW.source_id IS NOT OLD.source_id OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at OR NEW.reverses_entry_id IS NOT OLD.reverses_entry_id)
BEGIN SELECT RAISE(ABORT, 'posting cannot change journal metadata'); END;

CREATE TRIGGER line_insert_draft BEFORE INSERT ON journal_lines BEGIN
  SELECT CASE WHEN COALESCE((SELECT status FROM journal_entries WHERE id=NEW.entry_id), '') <> 'draft' THEN RAISE(ABORT, 'lines require a draft journal') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM journal_entries e JOIN ledger_accounts a ON a.id=NEW.account_id AND a.currency=e.currency WHERE e.id=NEW.entry_id) THEN RAISE(ABORT, 'account currency must match journal') END;
END;
CREATE TRIGGER line_update_draft BEFORE UPDATE ON journal_lines BEGIN
  SELECT CASE WHEN COALESCE((SELECT status FROM journal_entries WHERE id=OLD.entry_id), '') <> 'draft' OR COALESCE((SELECT status FROM journal_entries WHERE id=NEW.entry_id), '') <> 'draft' THEN RAISE(ABORT, 'posted lines are immutable') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM journal_entries e JOIN ledger_accounts a ON a.id=NEW.account_id AND a.currency=e.currency WHERE e.id=NEW.entry_id) THEN RAISE(ABORT, 'account currency must match journal') END;
END;
CREATE TRIGGER line_delete_draft BEFORE DELETE ON journal_lines
WHEN COALESCE((SELECT status FROM journal_entries WHERE id=OLD.entry_id), '') <> 'draft' BEGIN SELECT RAISE(ABORT, 'posted lines are immutable'); END;
CREATE TRIGGER account_no_change_if_used BEFORE UPDATE ON ledger_accounts
WHEN EXISTS (SELECT 1 FROM journal_lines WHERE account_id=OLD.id) BEGIN SELECT RAISE(ABORT, 'used accounts are immutable'); END;

CREATE TRIGGER journal_validate_post BEFORE UPDATE OF status ON journal_entries
WHEN NEW.status = 'posted' BEGIN
  SELECT CASE WHEN (SELECT count(*) FROM journal_lines WHERE entry_id=NEW.id) < 2 THEN RAISE(ABORT, 'journal requires at least two lines') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM journal_lines l LEFT JOIN ledger_accounts a ON a.id=l.account_id WHERE l.entry_id=NEW.id AND (a.id IS NULL OR a.currency <> NEW.currency)) THEN RAISE(ABORT, 'account currency must match journal') END;
  SELECT CASE WHEN (SELECT total(CASE WHEN side='debit' THEN amount_minor ELSE 0 END) FROM journal_lines WHERE entry_id=NEW.id) > 9007199254740991 OR (SELECT total(CASE WHEN side='credit' THEN amount_minor ELSE 0 END) FROM journal_lines WHERE entry_id=NEW.id) > 9007199254740991 THEN RAISE(ABORT, 'journal total exceeds safe integer') END;
  SELECT CASE WHEN (SELECT sum(CASE WHEN side='debit' THEN amount_minor ELSE -amount_minor END) FROM journal_lines WHERE entry_id=NEW.id) <> 0 THEN RAISE(ABORT, 'journal must balance') END;
  SELECT CASE WHEN NEW.reverses_entry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM journal_entries WHERE id=NEW.reverses_entry_id AND status='posted' AND currency=NEW.currency) THEN RAISE(ABORT, 'reversal requires a posted entry in the same currency') END;
  SELECT CASE WHEN NEW.reverses_entry_id IS NOT NULL AND EXISTS (
    SELECT account_id, side, sum(amount_minor) AS amount FROM journal_lines WHERE entry_id=NEW.id GROUP BY account_id, side
    EXCEPT
    SELECT account_id, CASE side WHEN 'debit' THEN 'credit' ELSE 'debit' END, sum(amount_minor) FROM journal_lines WHERE entry_id=NEW.reverses_entry_id GROUP BY account_id, side
  ) THEN RAISE(ABORT, 'reversal must exactly offset original') END;
  SELECT CASE WHEN NEW.reverses_entry_id IS NOT NULL AND EXISTS (
    SELECT account_id, CASE side WHEN 'debit' THEN 'credit' ELSE 'debit' END, sum(amount_minor) AS amount FROM journal_lines WHERE entry_id=NEW.reverses_entry_id GROUP BY account_id, side
    EXCEPT
    SELECT account_id, side, sum(amount_minor) FROM journal_lines WHERE entry_id=NEW.id GROUP BY account_id, side
  ) THEN RAISE(ABORT, 'reversal must exactly offset original') END;
END;
