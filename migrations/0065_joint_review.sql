-- Preserve the identities an administrator reviewed when adding a joint holding.
ALTER TABLE joint_shareholdings ADD COLUMN reviewed_members TEXT CHECK(reviewed_members IS NULL OR json_valid(reviewed_members));
CREATE TRIGGER joint_review_no_update BEFORE UPDATE OF reviewed_members ON joint_shareholdings WHEN NEW.reviewed_members IS NOT OLD.reviewed_members BEGIN SELECT RAISE(ABORT,'reviewed identities immutable'); END;
CREATE TRIGGER joint_review_validate BEFORE INSERT ON joint_shareholdings WHEN NEW.request_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') OR NEW.reviewed_members IS NULL OR json_type(NEW.reviewed_members)<>'array' OR json_array_length(NEW.reviewed_members) NOT BETWEEN 2 AND 100 OR EXISTS(SELECT 1 FROM json_each(NEW.reviewed_members) r WHERE NOT EXISTS(SELECT 1 FROM members m WHERE m.id=json_extract(r.value,'$.id') AND m.member_number=json_extract(r.value,'$.memberNumber') AND m.full_name=json_extract(r.value,'$.fullName') AND m.status='active')) THEN RAISE(ABORT,'reviewed members changed or unavailable') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.reviewed_members) r GROUP BY json_extract(r.value,'$.id') HAVING count(*)>1) THEN RAISE(ABORT,'duplicate member') END;
END;
