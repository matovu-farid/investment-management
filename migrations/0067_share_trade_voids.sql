-- Recorded trades remain immutable; corrections are appended as audited voids.
CREATE TABLE share_trade_voids (
 id TEXT PRIMARY KEY NOT NULL, trade_id TEXT NOT NULL UNIQUE REFERENCES share_trades(id),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 450), request_key TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL REFERENCES "user"(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER share_trade_void_validate BEFORE INSERT ON share_trade_voids BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=NEW.created_by AND role='admin') THEN RAISE(ABORT,'unauthorized') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM trade_publications WHERE trade_id=NEW.trade_id AND withdrawn_at IS NULL) THEN RAISE(ABORT,'withdraw active trade publication before void') END;
END;
CREATE TRIGGER share_trade_void_no_update BEFORE UPDATE ON share_trade_voids BEGIN SELECT RAISE(ABORT,'void history immutable'); END;
CREATE TRIGGER share_trade_void_no_delete BEFORE DELETE ON share_trade_voids BEGIN SELECT RAISE(ABORT,'void history immutable'); END;
CREATE TRIGGER share_trade_void_publication BEFORE INSERT ON trade_publications WHEN EXISTS(SELECT 1 FROM share_trade_voids WHERE trade_id=NEW.trade_id) BEGIN SELECT RAISE(ABORT,'trade void'); END;
