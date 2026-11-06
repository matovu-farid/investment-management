-- Corrections retain both the original source and its immutable void record.
CREATE TABLE investment_source_voids (
 id TEXT PRIMARY KEY NOT NULL,
 source_kind TEXT NOT NULL CHECK(source_kind IN ('valuation','transaction')),
 source_id TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 450),
 request_key TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL REFERENCES "user"(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(source_kind,source_id)
);
CREATE TRIGGER investment_void_validate BEFORE INSERT ON investment_source_voids BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN (NEW.source_kind='valuation' AND NOT EXISTS(SELECT 1 FROM investment_valuations WHERE id=NEW.source_id)) OR (NEW.source_kind='transaction' AND NOT EXISTS(SELECT 1 FROM investment_transactions WHERE id=NEW.source_id)) THEN RAISE(ABORT,'source not found') END;
 SELECT CASE WHEN NEW.source_kind='valuation' AND EXISTS(SELECT 1 FROM investment_publications WHERE valuation_id=NEW.source_id AND withdrawn_at IS NULL) THEN RAISE(ABORT,'active publication must be withdrawn') END;
END;
CREATE TRIGGER investment_void_no_update BEFORE UPDATE ON investment_source_voids BEGIN SELECT RAISE(ABORT,'void history immutable'); END;
CREATE TRIGGER investment_void_no_delete BEFORE DELETE ON investment_source_voids BEGIN SELECT RAISE(ABORT,'void history immutable'); END;
CREATE TRIGGER investment_void_no_publication BEFORE INSERT ON investment_publications WHEN EXISTS(SELECT 1 FROM investment_source_voids WHERE source_kind='valuation' AND source_id=NEW.valuation_id) BEGIN SELECT RAISE(ABORT,'valuation void'); END;
CREATE TRIGGER investment_void_valuation_no_update BEFORE UPDATE ON investment_valuations WHEN EXISTS(SELECT 1 FROM investment_source_voids WHERE source_kind='valuation' AND source_id=OLD.id) BEGIN SELECT RAISE(ABORT,'valuation void'); END;
CREATE TRIGGER investment_void_valuation_no_delete BEFORE DELETE ON investment_valuations WHEN EXISTS(SELECT 1 FROM investment_source_voids WHERE source_kind='valuation' AND source_id=OLD.id) BEGIN SELECT RAISE(ABORT,'valuation void'); END;
CREATE TRIGGER investment_void_transaction_no_update BEFORE UPDATE ON investment_transactions WHEN EXISTS(SELECT 1 FROM investment_source_voids WHERE source_kind='transaction' AND source_id=OLD.id) BEGIN SELECT RAISE(ABORT,'transaction void'); END;
CREATE TRIGGER investment_void_transaction_no_delete BEFORE DELETE ON investment_transactions WHEN EXISTS(SELECT 1 FROM investment_source_voids WHERE source_kind='transaction' AND source_id=OLD.id) BEGIN SELECT RAISE(ABORT,'transaction void'); END;
