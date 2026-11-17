-- Corrections preserve the original policy record and form an append-only chain.
CREATE TABLE policy_target_corrections (
 id TEXT PRIMARY KEY, policy_id TEXT NOT NULL REFERENCES policy_targets(id), previous_id TEXT REFERENCES policy_target_corrections(id),
 old_min INTEGER, old_max INTEGER, old_target INTEGER, old_source TEXT, old_notes TEXT,
 new_min INTEGER NOT NULL CHECK(typeof(new_min)='integer' AND new_min BETWEEN 0 AND 10000),
 new_max INTEGER NOT NULL CHECK(typeof(new_max)='integer' AND new_max BETWEEN 0 AND 10000),
 new_target INTEGER CHECK(new_target IS NULL OR (typeof(new_target)='integer' AND new_target BETWEEN new_min AND new_max)),
 new_source TEXT NOT NULL CHECK(length(trim(new_source)) BETWEEN 1 AND 500),
 new_notes TEXT CHECK(new_notes IS NULL OR length(trim(new_notes)) BETWEEN 1 AND 2000),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 450),
 created_by TEXT NOT NULL, request_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(new_min<=new_max)
);
CREATE INDEX policy_corrections_by_target ON policy_target_corrections(policy_id);
CREATE VIEW effective_policy_targets AS
 SELECT p.id,p.asset_class,p.effective_date,
 CASE WHEN c.id IS NULL THEN p.min_basis_points ELSE c.new_min END AS min_basis_points,
 CASE WHEN c.id IS NULL THEN p.max_basis_points ELSE c.new_max END AS max_basis_points,
 CASE WHEN c.id IS NULL THEN p.target_basis_points ELSE c.new_target END AS target_basis_points,
 CASE WHEN c.id IS NULL THEN p.source ELSE c.new_source END AS source,
 CASE WHEN c.id IS NULL THEN p.notes ELSE c.new_notes END AS notes,
 p.created_by,p.created_at,p.request_key,c.id AS correction_id
 FROM policy_targets p LEFT JOIN policy_target_corrections c ON c.id=(SELECT id FROM policy_target_corrections WHERE policy_id=p.id ORDER BY rowid DESC LIMIT 1);
CREATE TRIGGER policy_correction_insert BEFORE INSERT ON policy_target_corrections BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN NEW.previous_id IS NOT (SELECT id FROM policy_target_corrections WHERE policy_id=NEW.policy_id ORDER BY rowid DESC LIMIT 1) THEN RAISE(ABORT,'policy correction stale') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM policy_targets p LEFT JOIN policy_target_corrections c ON c.id=NEW.previous_id WHERE p.id=NEW.policy_id AND NEW.old_min IS CASE WHEN c.id IS NULL THEN p.min_basis_points ELSE c.new_min END AND NEW.old_max IS CASE WHEN c.id IS NULL THEN p.max_basis_points ELSE c.new_max END AND NEW.old_target IS CASE WHEN c.id IS NULL THEN p.target_basis_points ELSE c.new_target END AND NEW.old_source IS CASE WHEN c.id IS NULL THEN p.source ELSE c.new_source END AND NEW.old_notes IS CASE WHEN c.id IS NULL THEN p.notes ELSE c.new_notes END) THEN RAISE(ABORT,'policy changed; review again') END;
END;
CREATE TRIGGER policy_correction_no_update BEFORE UPDATE ON policy_target_corrections BEGIN SELECT RAISE(ABORT,'policy correction immutable'); END;
CREATE TRIGGER policy_correction_no_delete BEFORE DELETE ON policy_target_corrections BEGIN SELECT RAISE(ABORT,'policy correction immutable'); END;
CREATE TRIGGER policy_target_no_update BEFORE UPDATE ON policy_targets BEGIN SELECT RAISE(ABORT,'policy target immutable; use a correction'); END;
CREATE TRIGGER policy_target_no_delete BEFORE DELETE ON policy_targets BEGIN SELECT RAISE(ABORT,'policy target immutable'); END;
