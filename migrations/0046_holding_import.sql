-- A reviewed batch is inserted together, producing unpublished source observations only.
CREATE TABLE holding_import_batches (
 id TEXT PRIMARY KEY NOT NULL, request_key TEXT NOT NULL UNIQUE,
 rows_json TEXT NOT NULL CHECK(json_valid(rows_json) AND json_type(rows_json)='array'),
 created_by TEXT NOT NULL REFERENCES "user"(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER holding_import_validate BEFORE INSERT ON holding_import_batches BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN json_array_length(NEW.rows_json) NOT BETWEEN 1 AND 100 THEN RAISE(ABORT,'invalid batch') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.rows_json) r WHERE
   json_type(r.value,'$.memberId') NOT IN ('text','null') OR json_type(r.value,'$.jointHoldingId') NOT IN ('text','null')
   OR (json_type(r.value,'$.memberId')='null')=(json_type(r.value,'$.jointHoldingId')='null')
   OR json_type(r.value,'$.observedDate') IS NOT 'text' OR date(json_extract(r.value,'$.observedDate'),'+0 days') IS NOT json_extract(r.value,'$.observedDate') OR json_extract(r.value,'$.observedDate')>date('now','+3 hours')
   OR json_type(r.value,'$.shares') IS NOT 'text' OR length(json_extract(r.value,'$.shares')) NOT BETWEEN 1 AND 16 OR json_extract(r.value,'$.shares') GLOB '*[^0-9]*' OR CAST(json_extract(r.value,'$.shares') AS INTEGER)>9007199254740991 OR CAST(CAST(json_extract(r.value,'$.shares') AS INTEGER) AS TEXT) IS NOT json_extract(r.value,'$.shares')
   OR json_type(r.value,'$.source') IS NOT 'text' OR length(trim(json_extract(r.value,'$.source'))) NOT BETWEEN 1 AND 500
   OR json_type(r.value,'$.jointMembers') IS NOT 'array') THEN RAISE(ABORT,'invalid reviewed holding') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.rows_json) r GROUP BY coalesce('m:'||json_extract(r.value,'$.memberId'),'j:'||json_extract(r.value,'$.jointHoldingId')) HAVING count(*)>1) THEN RAISE(ABORT,'duplicate holder') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.rows_json) r WHERE json_extract(r.value,'$.memberId') IS NOT NULL AND (json_array_length(json_extract(r.value,'$.jointMembers'))<>0 OR NOT EXISTS(SELECT 1 FROM members m WHERE m.id=json_extract(r.value,'$.memberId') AND m.member_number=json_extract(r.value,'$.memberNumber') AND m.full_name=json_extract(r.value,'$.holderLabel') AND m.status='active'))) THEN RAISE(ABORT,'member changed or unavailable') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.rows_json) r WHERE json_extract(r.value,'$.jointHoldingId') IS NOT NULL AND (
   NOT EXISTS(SELECT 1 FROM joint_shareholdings h WHERE h.id=json_extract(r.value,'$.jointHoldingId') AND h.name=json_extract(r.value,'$.holderLabel'))
   OR json_array_length(json_extract(r.value,'$.jointMembers'))<2
   OR (SELECT count(*) FROM joint_shareholding_members jm WHERE jm.shareholding_id=json_extract(r.value,'$.jointHoldingId'))<>json_array_length(json_extract(r.value,'$.jointMembers'))
   OR EXISTS(SELECT 1 FROM json_each(json_extract(r.value,'$.jointMembers')) reviewed WHERE NOT EXISTS(SELECT 1 FROM joint_shareholding_members jm JOIN members m ON m.id=jm.member_id WHERE jm.shareholding_id=json_extract(r.value,'$.jointHoldingId') AND m.id=json_extract(reviewed.value,'$.id') AND m.member_number=json_extract(reviewed.value,'$.memberNumber') AND m.full_name=json_extract(reviewed.value,'$.fullName')))
   OR EXISTS(SELECT 1 FROM json_each(json_extract(r.value,'$.jointMembers')) reviewed GROUP BY json_extract(reviewed.value,'$.id') HAVING count(*)>1)
 )) THEN RAISE(ABORT,'joint members changed or unavailable') END;
END;
CREATE TRIGGER holding_import_apply AFTER INSERT ON holding_import_batches BEGIN
 INSERT INTO holding_observations(id,member_id,joint_holding_id,observed_date,shares,source,created_by,request_key)
 SELECT lower(hex(randomblob(16))),json_extract(r.value,'$.memberId'),json_extract(r.value,'$.jointHoldingId'),json_extract(r.value,'$.observedDate'),CAST(json_extract(r.value,'$.shares') AS INTEGER),json_extract(r.value,'$.source'),NEW.created_by,NEW.id||':'||r.key FROM json_each(NEW.rows_json) r;
END;
CREATE TRIGGER holding_import_no_update BEFORE UPDATE ON holding_import_batches BEGIN SELECT RAISE(ABORT,'batch immutable'); END;
CREATE TRIGGER holding_import_no_delete BEFORE DELETE ON holding_import_batches BEGIN SELECT RAISE(ABORT,'batch immutable'); END;
