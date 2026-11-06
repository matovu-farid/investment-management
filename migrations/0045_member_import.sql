-- One statement inserts both the audit record and all member rows, or none.
CREATE TABLE member_import_batches (
 id TEXT PRIMARY KEY NOT NULL,
 request_key TEXT NOT NULL UNIQUE,
 rows_json TEXT NOT NULL CHECK(json_valid(rows_json) AND json_type(rows_json)='array'),
 created_by TEXT NOT NULL REFERENCES "user"(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER member_import_validate BEFORE INSERT ON member_import_batches BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN json_array_length(NEW.rows_json)<1 OR json_array_length(NEW.rows_json)>100 THEN RAISE(ABORT,'invalid batch size') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.rows_json) r WHERE json_type(r.value,'$.memberNumber') IS NOT 'text' OR length(trim(json_extract(r.value,'$.memberNumber'))) NOT BETWEEN 1 AND 64 OR json_type(r.value,'$.fullName') IS NOT 'text' OR length(trim(json_extract(r.value,'$.fullName'))) NOT BETWEEN 1 AND 200 OR (json_type(r.value,'$.email') IS NOT 'text' AND json_type(r.value,'$.email') IS NOT 'null') OR (json_type(r.value,'$.email')='text' AND length(json_extract(r.value,'$.email'))>254)) THEN RAISE(ABORT,'invalid member') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.rows_json) r GROUP BY json_extract(r.value,'$.memberNumber') HAVING count(*)>1) THEN RAISE(ABORT,'duplicate member number') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.rows_json) r JOIN members m ON m.member_number=json_extract(r.value,'$.memberNumber')) THEN RAISE(ABORT,'member number conflict') END;
END;
CREATE TRIGGER member_import_apply AFTER INSERT ON member_import_batches BEGIN
 INSERT INTO members(id,member_number,full_name,email,status,created_by)
 SELECT lower(hex(randomblob(16))),json_extract(r.value,'$.memberNumber'),json_extract(r.value,'$.fullName'),json_extract(r.value,'$.email'),'active',NEW.created_by FROM json_each(NEW.rows_json) r;
END;
CREATE TRIGGER member_import_no_update BEFORE UPDATE ON member_import_batches BEGIN SELECT RAISE(ABORT,'import history immutable'); END;
CREATE TRIGGER member_import_no_delete BEFORE DELETE ON member_import_batches BEGIN SELECT RAISE(ABORT,'import history immutable'); END;
