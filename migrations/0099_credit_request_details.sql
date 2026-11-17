CREATE TABLE credit_request_details (
 id TEXT PRIMARY KEY NOT NULL,
 booking_id TEXT NOT NULL REFERENCES credit_bookings(id),
 previous_id TEXT REFERENCES credit_request_details(id),
 request_key TEXT NOT NULL UNIQUE,
 purpose TEXT NOT NULL CHECK(length(purpose)<=2000),
 repayment_promise TEXT NOT NULL CHECK(length(repayment_promise)<=2000),
 interest_option TEXT NOT NULL CHECK(length(interest_option)<=2000),
 duration TEXT NOT NULL CHECK(length(duration)<=2000),
 receiving_account TEXT NOT NULL CHECK(length(receiving_account)<=2000),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX credit_request_details_booking_idx ON credit_request_details(booking_id);
CREATE TRIGGER credit_request_details_immutable_update BEFORE UPDATE ON credit_request_details BEGIN SELECT RAISE(ABORT,'immutable'); END;
CREATE TRIGGER credit_request_details_immutable_delete BEFORE DELETE ON credit_request_details BEGIN SELECT RAISE(ABORT,'immutable'); END;
