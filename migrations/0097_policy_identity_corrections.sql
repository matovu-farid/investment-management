-- Preserve original rows and add an auditable corrected class and effective date.
-- Original identities remain reserved by the original unique constraint.
DROP VIEW effective_policy_targets;
DROP TRIGGER policy_correction_insert;
ALTER TABLE policy_target_corrections ADD COLUMN old_class TEXT;
ALTER TABLE policy_target_corrections ADD COLUMN old_effective_date TEXT;
ALTER TABLE policy_target_corrections ADD COLUMN new_class TEXT;
ALTER TABLE policy_target_corrections ADD COLUMN new_effective_date TEXT;
CREATE VIEW effective_policy_targets AS
 SELECT p.id,COALESCE((SELECT new_class FROM policy_target_corrections WHERE policy_id=p.id AND new_class IS NOT NULL ORDER BY rowid DESC LIMIT 1),p.asset_class) AS asset_class,
 COALESCE((SELECT new_effective_date FROM policy_target_corrections WHERE policy_id=p.id AND new_effective_date IS NOT NULL ORDER BY rowid DESC LIMIT 1),p.effective_date) AS effective_date,
 CASE WHEN c.id IS NULL THEN p.min_basis_points ELSE c.new_min END AS min_basis_points,
 CASE WHEN c.id IS NULL THEN p.max_basis_points ELSE c.new_max END AS max_basis_points,
 CASE WHEN c.id IS NULL THEN p.target_basis_points ELSE c.new_target END AS target_basis_points,
 CASE WHEN c.id IS NULL THEN p.source ELSE c.new_source END AS source,
 CASE WHEN c.id IS NULL THEN p.notes ELSE c.new_notes END AS notes,
 p.created_by,p.created_at,p.request_key,c.id AS correction_id
 FROM policy_targets p LEFT JOIN policy_target_corrections c ON c.id=(SELECT id FROM policy_target_corrections WHERE policy_id=p.id ORDER BY rowid DESC LIMIT 1);
CREATE TRIGGER policy_target_unique_insert BEFORE INSERT ON policy_targets
 WHEN EXISTS(SELECT 1 FROM effective_policy_targets WHERE asset_class=NEW.asset_class AND effective_date=NEW.effective_date)
 AND NOT EXISTS(SELECT 1 FROM policy_targets WHERE request_key=NEW.request_key)
 BEGIN SELECT RAISE(ABORT,'policy already exists for this class and date'); END;
CREATE TRIGGER policy_correction_insert BEFORE INSERT ON policy_target_corrections BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NEW.previous_id IS NOT (SELECT id FROM policy_target_corrections WHERE policy_id=NEW.policy_id ORDER BY rowid DESC LIMIT 1) THEN RAISE(ABORT,'policy correction stale') END;
 SELECT CASE WHEN (NEW.old_class IS NULL)<>(NEW.new_class IS NULL) OR (NEW.old_effective_date IS NULL)<>(NEW.new_effective_date IS NULL) OR (NEW.new_class IS NOT NULL AND length(trim(NEW.new_class)) NOT BETWEEN 1 AND 100) OR (NEW.new_effective_date IS NOT NULL AND date(NEW.new_effective_date,'+0 days') IS NOT NEW.new_effective_date) THEN RAISE(ABORT,'invalid policy identity') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM effective_policy_targets p WHERE p.id=NEW.policy_id AND (NEW.old_class IS NULL OR NEW.old_class IS p.asset_class) AND (NEW.old_effective_date IS NULL OR NEW.old_effective_date IS p.effective_date) AND NEW.old_min IS p.min_basis_points AND NEW.old_max IS p.max_basis_points AND NEW.old_target IS p.target_basis_points AND NEW.old_source IS p.source AND NEW.old_notes IS p.notes) THEN RAISE(ABORT,'policy changed; review again') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM effective_policy_targets current JOIN effective_policy_targets other ON other.id<>current.id AND other.asset_class=COALESCE(NEW.new_class,current.asset_class) AND other.effective_date=COALESCE(NEW.new_effective_date,current.effective_date) WHERE current.id=NEW.policy_id) THEN RAISE(ABORT,'policy already exists for this class and date') END;
END;
