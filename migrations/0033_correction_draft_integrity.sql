-- A correction link must not be detached from the metadata it validated.
-- Preserve status transitions while forbidding metadata edits on linked drafts.
CREATE TRIGGER correction_linked_journal_metadata_immutable
BEFORE UPDATE ON journal_entries
WHEN EXISTS (SELECT 1 FROM journal_corrections c WHERE c.journal_id=OLD.id)
 AND (NEW.id IS NOT OLD.id OR NEW.currency IS NOT OLD.currency OR NEW.effective_date IS NOT OLD.effective_date
   OR NEW.description IS NOT OLD.description OR NEW.source_type IS NOT OLD.source_type OR NEW.source_id IS NOT OLD.source_id
   OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at OR NEW.reverses_entry_id IS NOT OLD.reverses_entry_id)
BEGIN SELECT RAISE(ABORT,'linked correction journal metadata is immutable'); END;

-- Also reject malformed linked drafts that predate this migration, regardless of
-- their current source_type. The existing correction posting guard validates lines.
CREATE TRIGGER correction_linked_journal_validate_post
BEFORE UPDATE OF status ON journal_entries
WHEN NEW.status='posted' AND EXISTS(SELECT 1 FROM journal_corrections c WHERE c.journal_id=OLD.id)
 AND NOT EXISTS (
   SELECT 1 FROM journal_corrections c JOIN journal_entries r ON r.id=c.predecessor_reversal_id AND r.status='posted'
   JOIN app_user_roles a ON a.user_id=NEW.created_by AND a.role='admin'
   WHERE c.journal_id=NEW.id AND c.created_by=NEW.created_by AND c.request_key=NEW.source_id
     AND NEW.source_type=CASE c.source_kind WHEN 'loan' THEN 'loan-disbursement-correction' ELSE 'loan-repayment-correction' END
     AND NEW.reverses_entry_id IS NULL AND NEW.effective_date>=r.effective_date
 )
BEGIN SELECT RAISE(ABORT,'linked correction journal metadata is invalid'); END;
