-- A trade is a recorded completed event, not a scheduled transaction.
-- Do not silently reinterpret any existing future-dated facts during migration.
CREATE TABLE trade_date_preflight (ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO trade_date_preflight(ok)
SELECT CASE WHEN EXISTS (SELECT 1 FROM share_trades WHERE trade_date > date('now','+3 hours')) THEN 0 ELSE 1 END;
DROP TABLE trade_date_preflight;
CREATE TRIGGER trade_no_future BEFORE INSERT ON share_trades
WHEN NEW.trade_date > date('now','+3 hours')
BEGIN SELECT RAISE(ABORT,'completed trade date cannot be in the future'); END;
