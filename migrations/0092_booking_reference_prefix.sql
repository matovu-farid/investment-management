-- Existing source references remain intact and retryable; reserve the prefix for future imports.
CREATE TRIGGER booking_import_reserved_source_ref BEFORE INSERT ON booking_import_batches
WHEN EXISTS(SELECT 1 FROM json_each(NEW.rows_json) r WHERE substr(json_extract(r.value,'$.sourceRef'),1,3)='id:')
BEGIN SELECT RAISE(ABORT,'source reference prefix id: is reserved'); END;
