-- Historical facts; recording an event does not modify booking status or fund a loan.
CREATE TABLE booking_status_events (
 id TEXT PRIMARY KEY NOT NULL,
 booking_id TEXT NOT NULL REFERENCES credit_bookings(id),
 event_type TEXT NOT NULL CHECK(event_type IN ('held','resumed')),
 event_date TEXT NOT NULL CHECK(event_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 reason TEXT NOT NULL CHECK(length(trim(reason))>0),
 request_key TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL CHECK(length(trim(created_by))>0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX booking_status_events_booking_date ON booking_status_events(booking_id,event_date,id);
CREATE TRIGGER booking_status_event_date BEFORE INSERT ON booking_status_events
WHEN EXISTS (SELECT 1 FROM credit_bookings WHERE id=NEW.booking_id AND NEW.event_date<requested_date)
BEGIN SELECT RAISE(ABORT,'event date before booking request'); END;
CREATE TRIGGER booking_request_date_before_events BEFORE UPDATE OF requested_date ON credit_bookings
WHEN EXISTS (SELECT 1 FROM booking_status_events WHERE booking_id=OLD.id AND event_date<NEW.requested_date)
BEGIN SELECT RAISE(ABORT,'request date after booking event'); END;
CREATE TRIGGER booking_status_events_no_update BEFORE UPDATE ON booking_status_events
BEGIN SELECT RAISE(ABORT,'booking events are immutable'); END;
CREATE TRIGGER booking_status_events_no_delete BEFORE DELETE ON booking_status_events
BEGIN SELECT RAISE(ABORT,'booking events are immutable'); END;
